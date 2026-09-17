"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays, addHours, addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceTotals, computeDueDate, buildInvoiceNumber, deriveInvoiceStatus } from "@/lib/billing";
import { formatCurrency } from "@/lib/utils";
import {
  loadingAppointmentSchema,
  occupantSchema,
  parkingAssignmentSchema,
  paymentSchema,
  rentalSchema,
  settingsSchema,
  unitSchema
} from "@/lib/validations";
import { requireAdmin } from "@/lib/auth";
import { canCreateBox } from "@/lib/storage-rules";

export type CreateOccupantState =
  | { status: "idle" }
  | { status: "success"; occupantId: string }
  | { status: "error"; message: string };

export async function createOccupantAction(_prevState: CreateOccupantState, formData: FormData): Promise<CreateOccupantState> {
  await requireAdmin();
  const parsed = occupantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  const occupant = await prisma.occupant.create({
    data: {
      ...data,
      email: data.email ? data.email.toLowerCase() : null,
      company: data.company || null,
      address: data.address || null,
      city: data.city || null,
      postalCode: data.postalCode || null,
      notes: data.notes || null
    }
  });
  revalidatePath("/clients");
  revalidatePath("/parking");
  revalidatePath("/boxes");
  return { status: "success", occupantId: occupant.id };
}

export async function createUnitAction(formData: FormData) {
  await requireAdmin();
  const count = await prisma.storageUnit.count();
  if (!canCreateBox(count)) {
    throw new Error("Le dépôt contient exactement 30 box. Impossible d'en créer davantage.");
  }

  const data = unitSchema.parse({
    ...Object.fromEntries(formData),
    climateControlled: formData.get("climateControlled") === "on"
  });

  await prisma.storageUnit.create({
    data: {
      ...data,
      position: count + 1,
      accessNote: data.accessNote || null
    }
  });
  revalidatePath("/boxes");
  redirect("/boxes");
}

export type CreateRentalState =
  | { status: "idle" }
  | { status: "success"; invoiceId: string }
  | { status: "error"; message: string };

export async function createRentalAction(_prevState: CreateRentalState, formData: FormData): Promise<CreateRentalState> {
  await requireAdmin();
  const parsed = rentalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  const unit = await prisma.storageUnit.findUniqueOrThrow({ where: { id: data.unitId } });
  if (unit.status !== "AVAILABLE") {
    return { status: "error", message: "Ce box n'est pas disponible." };
  }

  const depositEnabled = (await prisma.appSetting.findUnique({ where: { key: "depositEnabled" } }))?.value === "true";
  const depositCents = depositEnabled ? data.depositCents : 0;
  const invoiceCount = await prisma.invoice.count();
  const issueDate = new Date();
  const rentalQuantity = data.type === "ONE_TIME" ? data.durationDays ?? 1 : 1;
  const invoiceLines = [
    ...(depositCents > 0 ? [{ quantity: 1, unitCents: depositCents }] : []),
    { quantity: rentalQuantity, unitCents: data.monthlyRateCents }
  ];
  const totals = calculateInvoiceTotals(invoiceLines);
  const paidCents = data.paidNow ? totals.totalCents : 0;
  const invoiceStatus = deriveInvoiceStatus(totals.totalCents, paidCents, computeDueDate(issueDate), issueDate);
  const endDate = data.type === "ONE_TIME" && data.durationDays ? addDays(data.startDate, data.durationDays) : null;

  const invoiceId = await prisma.$transaction(async (tx) => {
    const rental = await tx.rental.create({
      data: {
        occupantId: data.occupantId,
        unitId: data.unitId,
        type: data.type,
        startDate: data.startDate,
        endDate,
        billingDay: data.billingDay,
        depositCents: data.depositCents,
        monthlyRateCents: data.monthlyRateCents,
        status: "ACTIVE",
        accessCode: String(Math.floor(100000 + Math.random() * 900000))
      }
    });

    await tx.storageUnit.update({
      where: { id: data.unitId },
      data: { status: "OCCUPIED" }
    });

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: buildInvoiceNumber(issueDate, invoiceCount + 1),
        occupantId: data.occupantId,
        rentalId: rental.id,
        status: invoiceStatus,
        issueDate,
        dueDate: computeDueDate(issueDate),
        ...totals,
        paidCents,
        notes: endDate
          ? `Contrat ponctuel jusqu'au ${endDate.toLocaleDateString("fr-FR")}`
          : `Contrat mensuel, premier mois jusqu'au ${addMonths(data.startDate, 1).toLocaleDateString("fr-FR")}`,
        lines: {
          create: [
            ...(depositCents > 0
              ? [{
                  description: `Dépôt de garantie box ${unit.code}`,
                  quantity: 1,
                  unitCents: depositCents,
                  totalCents: depositCents
                }]
              : []),
            {
              description: `Location box ${unit.code}`,
              quantity: rentalQuantity,
              unitCents: data.monthlyRateCents,
              totalCents: data.monthlyRateCents * rentalQuantity
            }
          ]
        }
      }
    });

    if (data.paidNow) {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: totals.totalCents,
          method: "CASH",
          paidAt: issueDate
        }
      });
    }

    await tx.notification.create({
      data: {
        type: "SYSTEM",
        title: "Location activée",
        message: `Le box ${unit.code} est occupé depuis aujourd'hui.`
      }
    });

    return invoice.id;
  });

  revalidatePath("/boxes");
  revalidatePath("/invoices");
  return { status: "success", invoiceId };
}

export type ReleaseRentalState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function releaseRentalAction(_prevState: ReleaseRentalState, formData: FormData): Promise<ReleaseRentalState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const rental = await prisma.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { occupant: true, unit: true, invoices: true }
  });
  const unpaidInvoices = rental.invoices.filter((invoice) => invoice.status !== "VOID" && invoice.paidCents < invoice.totalCents);
  const unpaidBalance = unpaidInvoices.reduce((sum, invoice) => sum + (invoice.totalCents - invoice.paidCents), 0);

  await prisma.$transaction([
    prisma.rental.update({ where: { id: rentalId }, data: { status: "ENDED", endDate: new Date() } }),
    prisma.storageUnit.update({ where: { id: rental.unitId }, data: { status: "AVAILABLE" } }),
    ...unpaidInvoices.map((invoice) => prisma.invoice.update({ where: { id: invoice.id }, data: { status: "OVERDUE" } })),
    prisma.notification.create({
      data:
        unpaidBalance > 0
          ? {
              type: "PAYMENT_OVERDUE",
              title: "Créance client",
              message: `${rental.occupant.firstName} ${rental.occupant.lastName} a libéré le box ${rental.unit.code} avec un solde impayé de ${formatCurrency(unpaidBalance)}.`
            }
          : {
              type: "SYSTEM",
              title: "Box libéré",
              message: `Le box ${rental.unit.code} est disponible.`
            }
    })
  ]);
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  return { status: "success" };
}

export type ExtendRentalState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function extendRentalAction(_prevState: ExtendRentalState, formData: FormData): Promise<ExtendRentalState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const raw = String(formData.get("endDate") ?? "");
  const endDate = raw ? new Date(raw) : null;
  if (raw && Number.isNaN(endDate?.getTime())) {
    return { status: "error", message: "Date de sortie invalide." };
  }
  await prisma.rental.update({ where: { id: rentalId }, data: { endDate, exitAlertNotifiedAt: null } });
  revalidatePath("/boxes");
  return { status: "success" };
}

export type ConfirmBoxPaymentState =
  | { status: "idle" }
  | { status: "success"; invoiceId: string }
  | { status: "error"; message: string };

export async function confirmBoxPaymentAction(
  _prevState: ConfirmBoxPaymentState,
  formData: FormData
): Promise<ConfirmBoxPaymentState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const rental = await prisma.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { invoices: true }
  });
  const unpaidInvoices = rental.invoices.filter((invoice) => invoice.status !== "VOID" && invoice.paidCents < invoice.totalCents);
  if (unpaidInvoices.length === 0) {
    return { status: "error", message: "Aucune facture impayée pour ce box." };
  }

  const paidAt = new Date();
  await prisma.$transaction(
    unpaidInvoices.flatMap((invoice) => [
      prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: invoice.totalCents - invoice.paidCents,
          method: "CASH",
          paidAt
        }
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { paidCents: invoice.totalCents, status: "PAID" }
      })
    ])
  );
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success", invoiceId: unpaidInvoices[unpaidInvoices.length - 1].id };
}

export async function createPaymentAction(formData: FormData) {
  await requireAdmin();
  const data = paymentSchema.parse(Object.fromEntries(formData));
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: data.invoiceId } });
  const paidCents = invoice.paidCents + data.amountCents;
  const status = deriveInvoiceStatus(invoice.totalCents, paidCents, invoice.dueDate);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        ...data,
        paidAt: new Date(),
        reference: data.reference || null
      }
    }),
    prisma.invoice.update({
      where: { id: data.invoiceId },
      data: { paidCents, status }
    }),
    prisma.notification.create({
      data: {
        type: "PAYMENT_DUE",
        title: "Paiement enregistré",
        message: `Paiement de ${(data.amountCents / 100).toFixed(2)} EUR enregistré.`
      }
    })
  ]);
  revalidatePath("/invoices");
  redirect("/invoices");
}

export type AssignParkingState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function assignParkingAction(_prevState: AssignParkingState, formData: FormData): Promise<AssignParkingState> {
  await requireAdmin();
  const parsed = parkingAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  const [capacitySetting, rateSetting, currentCount] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "parkingSpaces" } }),
    prisma.appSetting.findUnique({ where: { key: "defaultParkingRateCents" } }),
    prisma.parkingAssignment.count({ where: { endDate: null } })
  ]);
  const capacity = Number(capacitySetting?.value ?? 0);
  if (currentCount >= capacity) {
    return { status: "error", message: "Aucune place de parking disponible." };
  }

  await prisma.parkingAssignment.create({
    data: {
      occupantId: data.occupantId,
      vehiclePlate: data.vehiclePlate,
      startDate: data.startDate,
      monthlyRateCents: Number(rateSetting?.value ?? 0)
    }
  });
  revalidatePath("/parking");
  return { status: "success" };
}

export type ReleaseParkingState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function releaseParkingAction(_prevState: ReleaseParkingState, formData: FormData): Promise<ReleaseParkingState> {
  await requireAdmin();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  await prisma.parkingAssignment.update({ where: { id: assignmentId }, data: { endDate: new Date() } });
  revalidatePath("/parking");
  return { status: "success" };
}

export type ScheduleLoadingState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function scheduleLoadingAction(_prevState: ScheduleLoadingState, formData: FormData): Promise<ScheduleLoadingState> {
  await requireAdmin();
  const parsed = loadingAppointmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  if (data.startsAt.getTime() < Date.now() - 60000) {
    return { status: "error", message: "Impossible de planifier un chargement dans le passé." };
  }
  const endsAt = data.durationUnit === "DAYS" ? addDays(data.startsAt, data.durationValue) : addHours(data.startsAt, data.durationValue);
  const [capacity, overlapping] = await Promise.all([
    prisma.loadingBay.count(),
    prisma.loadingAppointment.count({
      where: {
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: data.startsAt }
      }
    })
  ]);
  if (overlapping >= capacity) {
    return { status: "error", message: `Capacité de chargement atteinte pour ce créneau (max ${capacity} simultanés).` };
  }

  await prisma.$transaction([
    prisma.loadingAppointment.create({
      data: {
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        startsAt: data.startsAt,
        endsAt
      }
    }),
    prisma.notification.create({
      data: {
        type: "LOADING_TODAY",
        title: "Chargement programmé",
        message: "Un nouveau créneau de chargement a été réservé."
      }
    })
  ]);
  revalidatePath("/loading");
  return { status: "success" };
}

export type UpdateLoadingState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function updateLoadingAppointmentAction(_prevState: UpdateLoadingState, formData: FormData): Promise<UpdateLoadingState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = loadingAppointmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  const endsAt = data.durationUnit === "DAYS" ? addDays(data.startsAt, data.durationValue) : addHours(data.startsAt, data.durationValue);
  const [capacity, overlapping] = await Promise.all([
    prisma.loadingBay.count(),
    prisma.loadingAppointment.count({
      where: {
        id: { not: id },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: data.startsAt }
      }
    })
  ]);
  if (overlapping >= capacity) {
    return { status: "error", message: `Capacité de chargement atteinte pour ce créneau (max ${capacity} simultanés).` };
  }

  await prisma.loadingAppointment.update({
    where: { id },
    data: { clientName: data.clientName, clientPhone: data.clientPhone, startsAt: data.startsAt, endsAt }
  });
  revalidatePath("/loading");
  return { status: "success" };
}

export type DeleteLoadingState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function deleteLoadingAppointmentAction(_prevState: DeleteLoadingState, formData: FormData): Promise<DeleteLoadingState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.loadingAppointment.delete({ where: { id } });
  revalidatePath("/loading");
  return { status: "success" };
}

export async function markNotificationReadAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export type UpdateSettingsState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function updateSettingsAction(_prevState: UpdateSettingsState, formData: FormData): Promise<UpdateSettingsState> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: "parkingSpaces" },
      update: { value: String(data.parkingSpaces) },
      create: { key: "parkingSpaces", value: String(data.parkingSpaces), label: "Nombre de places parking" }
    });
    await tx.appSetting.upsert({
      where: { key: "defaultParkingRateCents" },
      update: { value: String(data.defaultParkingRateCents) },
      create: { key: "defaultParkingRateCents", value: String(data.defaultParkingRateCents), label: "Tarif parking par défaut" }
    });
    await tx.appSetting.upsert({
      where: { key: "notificationLeadDays" },
      update: { value: String(data.notificationLeadDays), label: "Alerte sortie impayée (jours)" },
      create: { key: "notificationLeadDays", value: String(data.notificationLeadDays), label: "Alerte sortie impayée (jours)" }
    });
    await tx.appSetting.upsert({
      where: { key: "depositEnabled" },
      update: { value: String(data.depositEnabled) },
      create: { key: "depositEnabled", value: String(data.depositEnabled), label: "Dépôt de garantie activé" }
    });
    await tx.appSetting.upsert({
      where: { key: "defaultDepositCents" },
      update: { value: String(data.defaultDepositCents) },
      create: { key: "defaultDepositCents", value: String(data.defaultDepositCents), label: "Dépôt de garantie par défaut" }
    });
  });
  revalidatePath("/settings");
  revalidatePath("/parking");
  return { status: "success" };
}

export type UpdateBoxRatesState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function updateBoxRatesAction(_prevState: UpdateBoxRatesState, formData: FormData): Promise<UpdateBoxRatesState> {
  await requireAdmin();
  const updates = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("rate_"))
    .map(([key, value]) => ({ unitId: key.slice(5), monthlyRateCents: Math.round(Number(value)) }))
    .filter((update) => Number.isFinite(update.monthlyRateCents) && update.monthlyRateCents > 0);

  await prisma.$transaction(
    updates.map((update) =>
      prisma.storageUnit.update({ where: { id: update.unitId }, data: { monthlyRateCents: update.monthlyRateCents } })
    )
  );
  revalidatePath("/settings");
  revalidatePath("/boxes");
  return { status: "success" };
}
