import { describe, expect, it } from "vitest";
import { occupantSchema, rentalSchema, unitSchema } from "@/lib/validations";

describe("zod validations", () => {
  it("requires valid occupant email", () => {
    expect(occupantSchema.safeParse({ email: "bad" }).success).toBe(false);
  });

  it("limits billing day to predictable monthly dates", () => {
    expect(
      rentalSchema.safeParse({
        occupantId: "o1",
        unitId: "u1",
        startDate: "2026-09-10",
        billingDay: 31,
        depositCents: 10000,
        monthlyRateCents: 7900
      }).success
    ).toBe(false);
  });

  it("accepts a complete storage unit", () => {
    expect(
      unitSchema.safeParse({
        code: "A-101",
        floor: 0,
        surfaceM2: 4.5,
        volumeM3: 11.2,
        monthlyRateCents: 7900,
        climateControlled: false
      }).success
    ).toBe(true);
  });
});
