import { addDays, endOfDay, isAfter } from "date-fns";

export function calculateInvoiceTotals(lines: Array<{ quantity: number; unitCents: number }>) {
  const subtotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
  return {
    subtotalCents,
    taxCents: 0,
    totalCents: subtotalCents
  };
}

export function buildInvoiceNumber(date: Date, sequence: number) {
  const year = date.getFullYear();
  return `FAC-${year}-${String(sequence).padStart(5, "0")}`;
}

export function computeDueDate(issueDate: Date) {
  return endOfDay(addDays(issueDate, 14));
}

export function deriveInvoiceStatus(totalCents: number, paidCents: number, dueDate: Date, now = new Date()) {
  if (paidCents >= totalCents) {
    return "PAID" as const;
  }

  if (isAfter(now, dueDate)) {
    return "OVERDUE" as const;
  }

  return "ISSUED" as const;
}
