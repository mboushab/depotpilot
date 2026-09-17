import { describe, expect, it } from "vitest";
import { canCreateBox, deriveUnitStatus, occupancyRate, validateBoxCapacity, validateLoadingBayCount } from "@/lib/storage-rules";

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

  it("enforces the fixed box and loading capacities", () => {
    expect(validateBoxCapacity(30)).toBe(true);
    expect(validateBoxCapacity(29)).toBe(false);
    expect(canCreateBox(29)).toBe(true);
    expect(canCreateBox(30)).toBe(false);
    expect(validateLoadingBayCount(2)).toBe(true);
  });
});
