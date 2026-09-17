import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(8, "Mot de passe requis")
});

const FRENCH_PHONE_REGEX = /^(0[1-9]\d{8}|(?:\+33|0033)[1-9]\d{8})$/;

export function isValidFrenchPhone(value: string) {
  return FRENCH_PHONE_REGEX.test(value.replace(/[\s.-]/g, ""));
}

export const occupantSchema = z.object({
  firstName: z.string().min(2, "Prénom trop court").max(80),
  lastName: z.string().min(2, "Nom trop court").max(80),
  email: z.string().email("Adresse e-mail invalide").optional().or(z.literal("")),
  phone: z.string().refine(isValidFrenchPhone, "Numéro de téléphone français invalide"),
  company: z.string().max(120).optional().or(z.literal("")),
  address: z.string().max(160).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  postalCode: z.string().max(12).optional().or(z.literal("")),
  country: z.string().min(2).max(2).default("FR"),
  notes: z.string().max(500).optional().or(z.literal(""))
});

export const unitSchema = z.object({
  code: z.string().min(2).max(24),
  floor: z.coerce.number().int().min(-3).max(20),
  surfaceM2: z.coerce.number().positive().max(500),
  volumeM3: z.coerce.number().positive().max(2000),
  monthlyRateCents: z.coerce.number().int().min(0).max(500000),
  climateControlled: z.coerce.boolean().default(false),
  accessNote: z.string().max(240).optional().or(z.literal(""))
});

export const rentalSchema = z
  .object({
    occupantId: z.string().min(1),
    unitId: z.string().min(1),
    type: z.enum(["MONTHLY", "ONE_TIME"]).default("MONTHLY"),
    startDate: z.coerce.date(),
    durationDays: z.coerce.number().int().min(1).max(3650).optional(),
    billingDay: z.coerce.number().int().min(1).max(28),
    depositCents: z.coerce.number().int().min(0).max(500000),
    monthlyRateCents: z.coerce.number().int().min(0).max(500000),
    paidNow: z.coerce.boolean().default(false)
  })
  .refine((data) => data.type !== "ONE_TIME" || data.durationDays !== undefined, {
    message: "Nombre de jours requis pour une location ponctuelle",
    path: ["durationDays"]
  });

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.coerce.number().int().positive().max(1000000),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "DIRECT_DEBIT"]),
  reference: z.string().max(120).optional().or(z.literal(""))
});

export const parkingAssignmentSchema = z.object({
  occupantId: z.string().min(1),
  vehiclePlate: z.string().min(2, "Plaque requise").max(20),
  startDate: z.coerce.date()
});

export const loadingAppointmentSchema = z.object({
  clientName: z.string().min(2, "Nom du client requis").max(120),
  clientPhone: z.string().refine(isValidFrenchPhone, "Numéro de téléphone français invalide"),
  startsAt: z.coerce.date(),
  durationValue: z.coerce.number().int().min(1).max(10),
  durationUnit: z.enum(["HOURS", "DAYS"])
});

export const settingsSchema = z.object({
  parkingSpaces: z.coerce.number().int().min(0).max(200),
  defaultParkingRateCents: z.coerce.number().int().min(0).max(200000),
  notificationLeadDays: z.coerce.number().int().min(0).max(30),
  depositEnabled: z.coerce.boolean().default(false),
  defaultDepositCents: z.coerce.number().int().min(0).max(500000)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type OccupantInput = z.infer<typeof occupantSchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type RentalInput = z.infer<typeof rentalSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ParkingAssignmentInput = z.infer<typeof parkingAssignmentSchema>;
export type LoadingAppointmentInput = z.infer<typeof loadingAppointmentSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
