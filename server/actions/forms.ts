"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { addDays, addHours, addMonths, differenceInCalendarDays, differenceInCalendarMonths, isAfter } from "date-fns";
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
import { conflictMessage, findConflict } from "@/lib/rental-conflicts";

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

export type DeleteOccupantState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function deleteOccupantAction(_prevState: DeleteOccupantState, formData: FormData): Promise<DeleteOccupantState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const occupant = await prisma.occupant.findUnique({
    where: { id },
    include: { rentals: true, parkingAssignments: true, invoices: true }
  });
  if (!occupant) {
    return { status: "error", message: "Client introuvable (déjà supprimé ?)." };
  }

  if (occupant.rentals.some((rental) => rental.status === "ACTIVE")) {
    return { status: "error", message: "Impossible de supprimer un client qui occupe un box." };
  }
  if (occupant.parkingAssignments.some((assignment) => !assignment.endDate)) {
    return { status: "error", message: "Impossible de supprimer un client qui occupe une place de parking." };
  }
  if (occupant.invoices.some((invoice) => invoice.status !== "VOID" && invoice.paidCents < invoice.totalCents)) {
    return { status: "error", message: "Impossible de supprimer un client qui a un solde impayé." };
  }

  // No active occupation left — safe to remove the client along with their
  // history (past rentals, invoices, payments, parking). Invoice deletion
  // cascades its lines and payments; occupant is deleted last since
  // Rental/Invoice/ParkingAssignment reference it with onDelete: Restrict.
  await prisma.$transaction([
    prisma.invoice.deleteMany({ where: { occupantId: id } }),
    prisma.rental.deleteMany({ where: { occupantId: id } }),
    prisma.parkingAssignment.deleteMany({ where: { occupantId: id } }),
    prisma.occupant.delete({ where: { id } })
  ]);
  revalidatePath("/clients");
  revalidatePath("/boxes");
  revalidatePath("/parking");
  revalidatePath("/invoices");
  return { status: "success" };
}

export type CreateUnitState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function createUnitAction(_prevState: CreateUnitState, formData: FormData): Promise<CreateUnitState> {
  await requireAdmin();
  const parsed = unitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;

  const existing = await prisma.storageUnit.findUnique({ where: { code: data.code } });
  if (existing) {
    return { status: "error", message: "Ce code de box existe déjà." };
  }

  const count = await prisma.storageUnit.count();
  await prisma.storageUnit.create({
    data: {
      ...data,
      surfaceM2: data.surfaceM2 ?? 0,
      floor: 0,
      volumeM3: 0,
      climateControlled: false,
      position: count + 1,
      accessNote: data.accessNote || null
    }
  });
  revalidatePath("/boxes");
  revalidatePath("/settings");
  return { status: "success" };
}

export type CreateRentalState =
  | { status: "idle" }
  | { status: "success"; invoiceId: string; paid: boolean }
  | { status: "error"; message: string };

export async function createRentalAction(_prevState: CreateRentalState, formData: FormData): Promise<CreateRentalState> {
  await requireAdmin();
  const parsed = rentalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
  const unit = await prisma.storageUnit.findUniqueOrThrow({ where: { id: data.unitId } });
  const newEndDate = data.type === "ONE_TIME" && data.durationDays ? addDays(data.startDate, data.durationDays) : null;

  // A box already rented for a period can still be booked ahead for
  // afterwards — only reject when the new dates actually overlap an
  // existing active rental on this box.
  const existingRentals = await prisma.rental.findMany({ where: { unitId: data.unitId, status: "ACTIVE" } });
  const candidate = { startDate: data.startDate, endDate: newEndDate };
  const conflict = findConflict(candidate, existingRentals);
  if (conflict) {
    return { status: "error", message: conflictMessage(candidate, conflict) };
  }

  const depositEnabled = (await prisma.appSetting.findUnique({ where: { key: "depositEnabled" } }))?.value === "true";
  const depositCents = depositEnabled ? data.depositCents : 0;
  const issueDate = new Date();
  // Based on the highest sequence actually in use for this year, not a row
  // count — deleting an invoice (e.g. via client deletion) leaves a gap that
  // a count-based "+1" can collide with an invoice number that still exists.
  const yearPrefix = `FAC-${issueDate.getFullYear()}-`;
  const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(RIGHT("invoiceNumber", 5) AS INTEGER)) as max
    FROM "Invoice"
    WHERE "invoiceNumber" LIKE ${yearPrefix + "%"}
  `;
  const nextInvoiceSeq = (max ?? 0) + 1;
  const invoiceLines = [
    ...(depositCents > 0 ? [{ quantity: 1, unitCents: depositCents }] : []),
    { quantity: 1, unitCents: data.monthlyRateCents }
  ];
  const totals = calculateInvoiceTotals(invoiceLines);
  let paidCents = 0;
  if (data.paymentMode === "FULL") {
    paidCents = totals.totalCents;
  } else if (data.paymentMode === "PARTIAL") {
    if (!data.partialAmountCents || data.partialAmountCents >= totals.totalCents) {
      return { status: "error", message: "Le montant partiel doit être supérieur à 0 et inférieur au prix total." };
    }
    paidCents = data.partialAmountCents;
  }
  const invoiceStatus = deriveInvoiceStatus(totals.totalCents, paidCents, computeDueDate(issueDate, data.type), issueDate);
  const endDate = newEndDate;
  const isFutureStart = differenceInCalendarDays(data.startDate, new Date()) > 0;
  // A future-dated rental only flips the box to RESERVED when it's
  // currently free — queued behind an existing rental, the box stays
  // whatever it already is (e.g. still OCCUPIED by the current tenant).
  const nextUnitStatus = !isFutureStart ? "OCCUPIED" : unit.status === "AVAILABLE" ? "RESERVED" : null;

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

    if (nextUnitStatus) {
      await tx.storageUnit.update({
        where: { id: data.unitId },
        data: { status: nextUnitStatus }
      });
    }

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: buildInvoiceNumber(issueDate, nextInvoiceSeq),
        occupantId: data.occupantId,
        rentalId: rental.id,
        status: invoiceStatus,
        issueDate,
        dueDate: computeDueDate(issueDate, data.type),
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
              description:
                data.type === "ONE_TIME"
                  ? `Location box ${unit.code} (${data.durationDays} jours, ${formatCurrency(data.monthlyRateCents)} au total)`
                  : `Location box ${unit.code}`,
              quantity: 1,
              unitCents: data.monthlyRateCents,
              totalCents: data.monthlyRateCents
            }
          ]
        }
      }
    });

    if (paidCents > 0) {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: paidCents,
          method: "CASH",
          paidAt: issueDate
        }
      });
    }

    return invoice.id;
  });

  revalidatePath("/boxes");
  revalidatePath("/invoices");
  return { status: "success", invoiceId, paid: paidCents >= totals.totalCents };
}

export type ReleaseRentalState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function releaseRentalAction(_prevState: ReleaseRentalState, formData: FormData): Promise<ReleaseRentalState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const rental = await prisma.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { occupant: true, unit: true }
  });

  // Releasing can leave other rentals on this box: one already running
  // keeps it OCCUPIED (e.g. ending a rental booked for later), one only
  // booked ahead makes it RESERVED, none frees it.
  const remaining = await prisma.rental.findMany({
    where: { unitId: rental.unitId, status: "ACTIVE", id: { not: rentalId } }
  });
  const now = new Date();
  const nextUnitStatus = remaining.some((other) => other.startDate <= now) ? "OCCUPIED" : remaining.length > 0 ? "RESERVED" : "AVAILABLE";

  await prisma.$transaction(async (tx) => {
    await tx.rental.update({ where: { id: rentalId }, data: { status: "ENDED", endDate: now } });
    await tx.storageUnit.update({ where: { id: rental.unitId }, data: { status: nextUnitStatus } });
    // The rent owed stops at the release date: a monthly rental is billed
    // for the months started up to today, like after an entry date change.
    // A one-off rental keeps its fixed price.
    if (rental.type === "MONTHLY") await repriceRentalInvoice(tx, { ...rental, endDate: now });
    // Whatever is still unpaid once the rental is over is overdue.
    await tx.invoice.updateMany({
      where: { rentalId, status: { notIn: ["VOID", "PAID"] } },
      data: { status: "OVERDUE" }
    });
  });
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success" };
}

export type CancelReservationState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function cancelReservationAction(
  _prevState: CancelReservationState,
  formData: FormData
): Promise<CancelReservationState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: rentalId }, include: { invoices: true } });
  if (rental.status !== "ACTIVE" || differenceInCalendarDays(rental.startDate, new Date()) <= 0) {
    return { status: "error", message: "Seule une réservation qui n'a pas encore commencé peut être annulée." };
  }

  const remaining = await prisma.rental.findMany({
    where: { unitId: rental.unitId, status: "ACTIVE", id: { not: rentalId } }
  });
  const now = new Date();
  const nextUnitStatus = remaining.some((other) => other.startDate <= now) ? "OCCUPIED" : remaining.length > 0 ? "RESERVED" : "AVAILABLE";
  // Invoices nothing was paid on are voided; any that received a payment
  // stay as they are so the accounting trail (and a refund, if due) is kept.
  const unpaidInvoices = rental.invoices.filter((invoice) => invoice.status !== "VOID" && invoice.paidCents === 0);

  await prisma.$transaction([
    prisma.rental.update({ where: { id: rentalId }, data: { status: "CANCELLED" } }),
    prisma.storageUnit.update({ where: { id: rental.unitId }, data: { status: nextUnitStatus } }),
    ...unpaidInvoices.map((invoice) => prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } }))
  ]);
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
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

  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: rentalId } });
  if (endDate && endDate < rental.startDate) {
    return { status: "error", message: "La date de sortie doit être après la date d'entrée." };
  }
  // Moving the exit date (or clearing it) must not run into a rental
  // already booked for after this one.
  const others = await prisma.rental.findMany({ where: { unitId: rental.unitId, status: "ACTIVE", id: { not: rentalId } } });
  const conflict = findConflict({ startDate: rental.startDate, endDate }, others);
  if (conflict) {
    return {
      status: "error",
      message: `Impossible : une location commence le ${conflict.startDate.toLocaleDateString("fr-FR")} sur ce box (sortie possible jusqu'au ${addDays(conflict.startDate, -1).toLocaleDateString("fr-FR")} au plus tard).`
    };
  }
  await prisma.rental.update({ where: { id: rentalId }, data: { endDate, exitAlertNotifiedAt: null } });
  revalidatePath("/boxes");
  return { status: "success" };
}

export type ConfirmBoxPaymentState =
  | { status: "idle" }
  | { status: "success"; invoiceId: string }
  | { status: "error"; message: string };

type PayableInvoice = { id: string; totalCents: number; paidCents: number; dueDate: Date; issueDate: Date; status: string };

// Shared by the box and client "Confirmer le paiement" actions: applies an
// amount across a set of unpaid invoices, oldest first, and returns the
// resulting error (if the amount is invalid) or the transaction operations.
async function applyPaymentAcrossInvoices(
  invoices: PayableInvoice[],
  requestedAmountCents: number | null
): Promise<{ error: string } | { operations: Prisma.PrismaPromise<unknown>[]; lastInvoiceId: string }> {
  const unpaidInvoices = invoices
    .filter((invoice) => invoice.status !== "VOID" && invoice.paidCents < invoice.totalCents)
    .sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime());
  if (unpaidInvoices.length === 0) {
    return { error: "Aucune facture impayée." } as const;
  }

  const totalRemaining = unpaidInvoices.reduce((sum, invoice) => sum + (invoice.totalCents - invoice.paidCents), 0);
  const amountToApply = requestedAmountCents ?? totalRemaining;
  if (!Number.isFinite(amountToApply) || amountToApply <= 0) {
    return { error: "Montant invalide." } as const;
  }
  if (amountToApply > totalRemaining) {
    return { error: "Le montant ne peut pas dépasser le solde restant." } as const;
  }

  const paidAt = new Date();
  let remaining = amountToApply;
  let lastInvoiceId = unpaidInvoices[unpaidInvoices.length - 1].id;
  const operations: Prisma.PrismaPromise<unknown>[] = [];
  for (const invoice of unpaidInvoices) {
    if (remaining <= 0) break;
    const dueOnThis = invoice.totalCents - invoice.paidCents;
    const applyAmount = Math.min(dueOnThis, remaining);
    const newPaidCents = invoice.paidCents + applyAmount;
    operations.push(
      prisma.payment.create({
        data: { invoiceId: invoice.id, amountCents: applyAmount, method: "CASH", paidAt }
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { paidCents: newPaidCents, status: deriveInvoiceStatus(invoice.totalCents, newPaidCents, invoice.dueDate) }
      })
    );
    lastInvoiceId = invoice.id;
    remaining -= applyAmount;
  }

  return { operations, lastInvoiceId } as const;
}

function parseAmountCents(formData: FormData) {
  const raw = formData.get("amountCents");
  return raw && String(raw).trim() !== "" ? Number(raw) : null;
}

export type UpdateRentalRateState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function updateRentalRateAction(
  _prevState: UpdateRentalRateState,
  formData: FormData
): Promise<UpdateRentalRateState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const newRateCents = Number(formData.get("monthlyRateCents"));
  if (!Number.isFinite(newRateCents) || newRateCents <= 0) {
    return { status: "error", message: "Prix invalide." };
  }

  const rental = await prisma.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { invoices: { include: { lines: true } } }
  });

  await prisma.$transaction(async (tx) => {
    await tx.rental.update({ where: { id: rentalId }, data: { monthlyRateCents: newRateCents } });
    for (const invoice of rental.invoices) {
      const rentalLine = invoice.lines.find((line) => line.description.startsWith("Location"));
      if (!rentalLine) continue;
      // The rental line can cover several months (see the start date edit).
      const rentalLineTotal = newRateCents * rentalLine.quantity;
      await tx.invoiceLine.update({
        where: { id: rentalLine.id },
        data: { unitCents: newRateCents, totalCents: rentalLineTotal }
      });
      const otherLinesTotal = invoice.lines
        .filter((line) => line.id !== rentalLine.id)
        .reduce((sum, line) => sum + line.totalCents, 0);
      const newTotalCents = otherLinesTotal + rentalLineTotal;

      // A rental already marked fully paid shouldn't flip back to unpaid
      // just because the price was corrected upward — treat the increase
      // as covered too, recorded as its own payment so the ledger stays
      // accurate.
      const wasFullyPaid = invoice.paidCents >= invoice.totalCents;
      let newPaidCents = invoice.paidCents;
      if (wasFullyPaid && newTotalCents > invoice.paidCents) {
        const adjustment = newTotalCents - invoice.paidCents;
        newPaidCents = newTotalCents;
        await tx.payment.create({
          data: { invoiceId: invoice.id, amountCents: adjustment, method: "CASH", paidAt: new Date() }
        });
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotalCents: newTotalCents,
          totalCents: newTotalCents,
          paidCents: newPaidCents,
          status: deriveInvoiceStatus(newTotalCents, newPaidCents, invoice.dueDate)
        }
      });
    }
  });

  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success" };
}

// Whether a box is OCCUPIED or only RESERVED depends on whether any of its
// active rentals has started yet — recomputed after a start date changes.
function unitStatusFor(rentals: { startDate: Date }[]) {
  const now = new Date();
  return rentals.some((rental) => rental.startDate <= now) ? "OCCUPIED" : "RESERVED";
}

// Re-prices the rental invoice after the start date or the type changed.
// A monthly rental owes one rent per month started since it began (from the
// start date up to today, at least the first); a one-off rental owes its
// fixed price once. Anything already paid stays recorded: an overpayment
// just leaves the balance at zero.
async function repriceRentalInvoice(
  tx: Prisma.TransactionClient,
  rental: { id: string; type: string; startDate: Date; endDate: Date | null; monthlyRateCents: number; unit: { code: string } }
) {
  const invoices = await tx.invoice.findMany({
    where: { rentalId: rental.id, status: { not: "VOID" } },
    include: { lines: true },
    orderBy: { issueDate: "asc" }
  });
  const invoice = invoices.find((candidate) => candidate.lines.some((line) => line.description.startsWith("Location")));
  const rentalLine = invoice?.lines.find((line) => line.description.startsWith("Location"));
  if (!invoice || !rentalLine) return;

  const rate = rental.monthlyRateCents;
  let quantity = 1;
  let description = `Location box ${rental.unit.code}`;
  if (rental.type === "MONTHLY") {
    // A month is started once its day-of-month has come around: from the
    // 15th, the 15th of the next month begins month two.
    const today = new Date();
    quantity = isAfter(rental.startDate, today)
      ? 1
      : Math.max(1, differenceInCalendarMonths(today, rental.startDate) + (today.getDate() >= rental.startDate.getDate() ? 1 : 0));
    if (quantity > 1) description += ` (${quantity} mois)`;
  } else if (rental.endDate) {
    description += ` (${differenceInCalendarDays(rental.endDate, rental.startDate)} jours, ${formatCurrency(rate)} au total)`;
  }

  const lineTotal = rate * quantity;
  await tx.invoiceLine.update({
    where: { id: rentalLine.id },
    data: { quantity, unitCents: rate, totalCents: lineTotal, description }
  });
  const otherLinesTotal = invoice.lines.filter((line) => line.id !== rentalLine.id).reduce((sum, line) => sum + line.totalCents, 0);
  const newTotalCents = otherLinesTotal + lineTotal;
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      subtotalCents: newTotalCents,
      totalCents: newTotalCents,
      // Rent for months already gone by that isn't settled is overdue, even
      // though the invoice's original due date (30 days after issue) may
      // not have passed yet.
      status: quantity > 1 && newTotalCents > invoice.paidCents
        ? "OVERDUE"
        : deriveInvoiceStatus(newTotalCents, invoice.paidCents, invoice.dueDate)
    }
  });
}

export type UpdateRentalStartDateState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function updateRentalStartDateAction(
  _prevState: UpdateRentalStartDateState,
  formData: FormData
): Promise<UpdateRentalStartDateState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const raw = String(formData.get("startDate") ?? "");
  const startDate = raw ? new Date(raw) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return { status: "error", message: "Date d'entrée invalide." };
  }

  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: rentalId }, include: { unit: true } });
  if (rental.endDate && startDate > rental.endDate) {
    return { status: "error", message: "La date d'entrée doit être avant la date de sortie." };
  }
  const others = await prisma.rental.findMany({ where: { unitId: rental.unitId, status: "ACTIVE", id: { not: rentalId } } });
  const candidate = { startDate, endDate: rental.endDate };
  const conflict = findConflict(candidate, others);
  if (conflict) {
    return { status: "error", message: conflictMessage(candidate, conflict) };
  }

  await prisma.$transaction(async (tx) => {
    await tx.rental.update({ where: { id: rentalId }, data: { startDate } });
    await repriceRentalInvoice(tx, { ...rental, startDate });

    if (rental.status === "ACTIVE") {
      await tx.storageUnit.update({
        where: { id: rental.unitId },
        data: { status: unitStatusFor([{ startDate }, ...others]) }
      });
    }
  });
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success" };
}

export type UpdateRentalTypeState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function updateRentalTypeAction(
  _prevState: UpdateRentalTypeState,
  formData: FormData
): Promise<UpdateRentalTypeState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (type !== "MONTHLY" && type !== "ONE_TIME") {
    return { status: "error", message: "Type de location invalide." };
  }

  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: rentalId }, include: { unit: true } });
  // A one-off rental always has an exit date; a monthly one is open-ended,
  // so going monthly clears the exit date.
  let endDate: Date | null = null;
  if (type === "ONE_TIME") {
    endDate = rental.endDate;
    const raw = String(formData.get("endDate") ?? "");
    if (raw) {
      endDate = new Date(raw);
      if (Number.isNaN(endDate.getTime())) return { status: "error", message: "Date de sortie invalide." };
    }
    if (!endDate) return { status: "error", message: "Une location ponctuelle nécessite une date de sortie." };
    if (endDate < rental.startDate) {
      return { status: "error", message: "La date de sortie doit être après la date d'entrée." };
    }
  }
  // Open-ended monthly rentals can't run into a rental booked for later.
  const others = await prisma.rental.findMany({ where: { unitId: rental.unitId, status: "ACTIVE", id: { not: rentalId } } });
  const candidate = { startDate: rental.startDate, endDate };
  const conflict = findConflict(candidate, others);
  if (conflict) return { status: "error", message: conflictMessage(candidate, conflict) };

  await prisma.$transaction(async (tx) => {
    await tx.rental.update({
      where: { id: rentalId },
      data: { type, endDate, ...(endDate?.getTime() !== rental.endDate?.getTime() ? { exitAlertNotifiedAt: null } : {}) }
    });
    await repriceRentalInvoice(tx, { ...rental, type, endDate });
  });
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success" };
}

export type MarkRentalUnpaidState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function markRentalUnpaidAction(
  _prevState: MarkRentalUnpaidState,
  formData: FormData
): Promise<MarkRentalUnpaidState> {
  await requireAdmin();
  const rentalId = String(formData.get("rentalId") ?? "");
  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: rentalId }, include: { invoices: true } });
  const paidInvoices = rental.invoices.filter((invoice) => invoice.paidCents > 0);
  if (paidInvoices.length === 0) {
    return { status: "error", message: "Ce box n'a aucun paiement enregistré." };
  }

  await prisma.$transaction([
    ...paidInvoices.map((invoice) => prisma.payment.deleteMany({ where: { invoiceId: invoice.id } })),
    ...paidInvoices.map((invoice) =>
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { paidCents: 0, status: deriveInvoiceStatus(invoice.totalCents, 0, invoice.dueDate) }
      })
    )
  ]);
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success" };
}

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

  const result = await applyPaymentAcrossInvoices(rental.invoices, parseAmountCents(formData));
  if ("error" in result) {
    return { status: "error", message: result.error };
  }

  await prisma.$transaction(result.operations);
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success", invoiceId: result.lastInvoiceId };
}

export type ConfirmClientPaymentState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export async function confirmClientPaymentAction(
  _prevState: ConfirmClientPaymentState,
  formData: FormData
): Promise<ConfirmClientPaymentState> {
  await requireAdmin();
  const occupantId = String(formData.get("occupantId") ?? "");
  const invoices = await prisma.invoice.findMany({ where: { occupantId } });

  const result = await applyPaymentAcrossInvoices(invoices, parseAmountCents(formData));
  if ("error" in result) {
    return { status: "error", message: result.error };
  }

  await prisma.$transaction(result.operations);
  revalidatePath("/boxes");
  revalidatePath("/invoices");
  revalidatePath("/clients");
  return { status: "success" };
}

export type CreatePaymentState = { status: "idle" } | { status: "error"; message: string };

export async function createPaymentAction(_prevState: CreatePaymentState, formData: FormData): Promise<CreatePaymentState> {
  await requireAdmin();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const data = parsed.data;
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
  const rateSetting = await prisma.appSetting.findUnique({ where: { key: "defaultParkingRateCents" } });

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

  await prisma.loadingAppointment.create({
    data: {
      clientName: data.clientName,
      clientPhone: data.clientPhone || null,
      startsAt: data.startsAt,
      endsAt
    }
  });
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
    data: { clientName: data.clientName, clientPhone: data.clientPhone || null, startsAt: data.startsAt, endsAt }
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

export async function markAllNotificationsReadAction() {
  await requireAdmin();
  await prisma.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
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
