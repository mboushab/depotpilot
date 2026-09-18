import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { addDays, addHours, setHours, setMinutes, subDays } from "date-fns";
import { buildInvoiceNumber, calculateInvoiceTotals, computeDueDate } from "../lib/billing";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.DEMO_ADMIN_EMAIL ?? "admin@boxpilot.local").toLowerCase();
  const password = process.env.DEMO_ADMIN_PASSWORD ?? "BoxPilot!2026";

  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Admin Démo",
      passwordHash: await hash(password, 12)
    }
  });

  await seedSettings();
  const occupants = await seedOccupants();
  const boxes = await seedBoxes();
  await seedLoadingBays();

  if ((await prisma.rental.count()) === 0) {
    await createDemoRental(occupants[0].id, boxes[0].id, boxes[0].code, boxes[0].monthlyRateCents, 0, 1);
    await createDemoRental(occupants[1].id, boxes[6].id, boxes[6].code, boxes[6].monthlyRateCents, 0, 2);
  }

  await ensureDemoRental(occupants[0].id, "B-08", "occupied");
  await ensureDemoRental(occupants[1].id, "B-09", "leavingSoon");

  if ((await prisma.parkingAssignment.count()) === 0) {
    await prisma.parkingAssignment.create({
      data: {
        occupantId: occupants[0].id,
        vehiclePlate: "AB-123-CD",
        startDate: subDays(new Date(), 12),
        monthlyRateCents: 4500
      }
    });
  }

  await prisma.rental.updateMany({
    where: { status: "ACTIVE", occupantId: occupants[1].id, endDate: null },
    data: { endDate: addDays(new Date(), 5) }
  });

  if ((await prisma.loadingAppointment.count()) === 0) {
    const start = setMinutes(setHours(new Date(), 10), 0);
    await prisma.loadingAppointment.create({
      data: {
        clientName: `${occupants[1].firstName} ${occupants[1].lastName}`,
        clientPhone: occupants[1].phone,
        startsAt: start,
        endsAt: addHours(start, 2)
      }
    });
  }

  if ((await prisma.notification.count()) === 0) {
    await prisma.notification.createMany({
      data: [
        { type: "SYSTEM", title: "Dépôt initialisé", message: "30 box, parking et 2 emplacements de chargement sont prêts." },
        { type: "PAYMENT_DUE", title: "Factures à suivre", message: "Une facture de démonstration est en attente de paiement." }
      ]
    });
  }
}

async function seedSettings() {
  await prisma.appSetting.upsert({
    where: { key: "parkingSpaces" },
    update: {},
    create: { key: "parkingSpaces", value: "12", label: "Nombre de places parking" }
  });
  await prisma.appSetting.upsert({
    where: { key: "defaultParkingRateCents" },
    update: {},
    create: { key: "defaultParkingRateCents", value: "4500", label: "Tarif parking par défaut" }
  });
  await prisma.appSetting.upsert({
    where: { key: "notificationLeadDays" },
    update: {},
    create: { key: "notificationLeadDays", value: "7", label: "Préavis notifications" }
  });
  await prisma.appSetting.upsert({
    where: { key: "depositEnabled" },
    update: {},
    create: { key: "depositEnabled", value: "false", label: "Dépôt de garantie activé" }
  });
  await prisma.appSetting.upsert({
    where: { key: "defaultDepositCents" },
    update: {},
    create: { key: "defaultDepositCents", value: "0", label: "Dépôt de garantie par défaut" }
  });
}

async function seedOccupants() {
  return Promise.all([
    prisma.occupant.upsert({
      where: { email: "camille.martin@example.com" },
      update: {},
      create: {
        firstName: "Camille",
        lastName: "Martin",
        email: "camille.martin@example.com",
        phone: "0601020304",
        address: "12 rue des Ateliers",
        city: "Lyon",
        postalCode: "69003",
        country: "FR",
        notes: "Accès fréquent le samedi."
      }
    }),
    prisma.occupant.upsert({
      where: { email: "nadir.benali@example.com" },
      update: {},
      create: {
        firstName: "Nadir",
        lastName: "Benali",
        email: "nadir.benali@example.com",
        phone: "0611121314",
        company: "Benali Events",
        address: "8 avenue Carnot",
        city: "Villeurbanne",
        postalCode: "69100",
        country: "FR"
      }
    })
  ]);
}

async function seedBoxes() {
  const specs = Array.from({ length: 30 }, (_, index) => {
    const position = index + 1;
    const large = position % 5 === 0;
    return {
      code: `B-${String(index).padStart(2, "0")}`,
      position,
      floor: position > 20 ? 1 : 0,
      surfaceM2: large ? 12 : position % 3 === 0 ? 8 : 5,
      volumeM3: large ? 32 : position % 3 === 0 ? 21 : 13,
      monthlyRateCents: large ? 18900 : position % 3 === 0 ? 12900 : 7900,
      climateControlled: position > 10 && position <= 20,
      status: position === 1 || position === 7 ? "OCCUPIED" as const : "AVAILABLE" as const
    };
  });

  return Promise.all(
    specs.map((box) =>
      prisma.storageUnit.upsert({
        where: { code: box.code },
        update: {},
        create: box
      })
    )
  );
}

async function seedLoadingBays() {
  return Promise.all(
    [1, 2].map((position) =>
      prisma.loadingBay.upsert({
        where: { code: `CH-${position}` },
        update: {},
        create: { code: `CH-${position}`, position }
      })
    )
  );
}

async function createDemoRental(
  occupantId: string,
  unitId: string,
  unitCode: string,
  monthlyRateCents: number,
  depositCents: number,
  sequence: number
) {
  const startDate = subDays(new Date(), 20 + sequence * 5);
  const lines = [
    ...(depositCents > 0 ? [{ quantity: 1, unitCents: depositCents }] : []),
    { quantity: 1, unitCents: monthlyRateCents }
  ];
  const totals = calculateInvoiceTotals(lines);

  await prisma.rental.create({
    data: {
      occupantId,
      unitId,
      status: "ACTIVE",
      startDate,
      endDate: sequence === 2 ? addDays(new Date(), 5) : null,
      billingDay: 5,
      depositCents,
      monthlyRateCents,
      accessCode: `42${sequence}8${sequence}0`,
      invoices: {
        create: {
          occupantId,
          invoiceNumber: buildInvoiceNumber(startDate, sequence),
          status: sequence === 1 ? "PAID" : "ISSUED",
          issueDate: startDate,
          dueDate: computeDueDate(startDate),
          paidCents: sequence === 1 ? totals.totalCents : 0,
          ...totals,
          lines: {
            create: [
              ...(depositCents > 0
                ? [{ description: `Dépôt de garantie box ${unitCode}`, quantity: 1, unitCents: depositCents, totalCents: depositCents }]
                : []),
              { description: `Premier mois box ${unitCode}`, quantity: 1, unitCents: monthlyRateCents, totalCents: monthlyRateCents }
            ]
          }
        }
      }
    }
  });
}

async function ensureDemoRental(occupantId: string, unitCode: string, signal: "occupied" | "leavingSoon") {
  const box = await prisma.storageUnit.findUnique({ where: { code: unitCode }, include: { rentals: { where: { status: "ACTIVE" } } } });
  if (!box || box.rentals.length > 0) {
    return;
  }

  const startDate = subDays(new Date(), 10);
  const invoiceCount = await prisma.invoice.count();
  const totals = calculateInvoiceTotals([{ quantity: 1, unitCents: box.monthlyRateCents }]);

  await prisma.$transaction([
    prisma.rental.create({
      data: {
        occupantId,
        unitId: box.id,
        status: "ACTIVE",
        startDate,
        endDate: signal === "leavingSoon" ? addDays(new Date(), 5) : null,
        billingDay: 5,
        depositCents: 0,
        monthlyRateCents: box.monthlyRateCents,
        accessCode: signal === "leavingSoon" ? "751005" : "751009",
        invoices: {
          create: {
            occupantId,
            invoiceNumber: buildInvoiceNumber(new Date(), invoiceCount + 1),
            status: "PAID",
            issueDate: startDate,
            dueDate: computeDueDate(startDate),
            paidCents: totals.totalCents,
            ...totals,
            lines: {
              create: [
                { description: `Mois courant box ${box.code}`, quantity: 1, unitCents: box.monthlyRateCents, totalCents: box.monthlyRateCents }
              ]
            }
          }
        }
      }
    }),
    prisma.storageUnit.update({ where: { id: box.id }, data: { status: "OCCUPIED" } })
  ]);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
