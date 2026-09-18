import { describe, expect, it } from "vitest";
import { deriveUnitStatus, occupancyRate, validateLoadingBayCount } from "@/lib/storage-rules";

describe("storage rules", () => {
  it("prioritizes active rentals over reservations", () => {
    expect(deriveUnitStatus([{ status: "RESERVED" }, { status: "ACTIVE" }])).toBe("OCCUPIED");
  });

  it("handles empty occupancy safely", () => {
    expect(occupancyRate(0, 0)).toBe(0);
  });

  it("computes occupancy ratio", () => {
    expect(occupancyRate(10, 7)).toBe(0.7);
  });

  it("enforces the fixed loading capacity", () => {
    expect(validateLoadingBayCount(2)).toBe(true);
    expect(validateLoadingBayCount(3)).toBe(false);
  });
});
