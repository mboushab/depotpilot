import { describe, expect, it } from "vitest";
import { buildInvoiceNumber, calculateInvoiceTotals, deriveInvoiceStatus } from "@/lib/billing";

describe("billing rules", () => {
  it("calculates total from invoice lines without tax", () => {
    expect(calculateInvoiceTotals([{ quantity: 2, unitCents: 5000 }])).toEqual({
      subtotalCents: 10000,
      taxCents: 0,
      totalCents: 10000
    });
  });

  it("builds sequential invoice numbers", () => {
    expect(buildInvoiceNumber(new Date("2026-09-10T09:00:00Z"), 42)).toBe("FAC-2026-00042");
  });

  it("marks overdue invoices after due date", () => {
    expect(deriveInvoiceStatus(12000, 0, new Date("2026-09-01"), new Date("2026-09-10"))).toBe("OVERDUE");
  });

  it("marks paid invoices when payment covers total", () => {
    expect(deriveInvoiceStatus(12000, 12000, new Date("2026-09-01"), new Date("2026-09-10"))).toBe("PAID");
  });
});
