import { describe, expect, it } from "vitest";
import { availableSince, conflictMessage, findConflict, lastAvailableDate, rangesOverlap } from "@/lib/rental-conflicts";

const d = (value: string) => new Date(`${value}T12:00:00`);
const range = (start: string, end: string | null) => ({ startDate: d(start), endDate: end ? d(end) : null });

describe("rangesOverlap", () => {
  it("treats shared boundary days as overlapping (both ends included)", () => {
    expect(rangesOverlap(range("2026-11-01", "2026-11-10"), range("2026-11-10", "2026-11-20"))).toBe(true);
  });

  it("allows back-to-back rentals with a day between", () => {
    expect(rangesOverlap(range("2026-11-01", "2026-11-10"), range("2026-11-11", "2026-11-20"))).toBe(false);
  });

  it("treats a rental without an end date as open-ended", () => {
    expect(rangesOverlap(range("2026-11-01", null), range("2027-03-01", "2027-03-05"))).toBe(true);
    expect(rangesOverlap(range("2026-11-01", null), range("2026-10-01", "2026-10-31"))).toBe(false);
  });
});

describe("findConflict", () => {
  it("returns the overlapping rental, if any", () => {
    const existing = [range("2026-10-01", "2026-10-31"), range("2026-12-01", "2026-12-15")];
    expect(findConflict(range("2026-11-01", "2026-11-30"), existing)).toBeUndefined();
    expect(findConflict(range("2026-11-20", "2026-12-02"), existing)).toBe(existing[1]);
  });
});

describe("lastAvailableDate", () => {
  it("is the day before the next rental starts", () => {
    const existing = [range("2026-10-01", "2026-10-31"), range("2026-12-01", null)];
    expect(lastAvailableDate(d("2026-11-05"), existing)?.getDate()).toBe(30);
    expect(lastAvailableDate(d("2026-11-05"), existing)?.getMonth()).toBe(10);
  });

  it("is null when nothing is booked afterwards", () => {
    expect(lastAvailableDate(d("2026-11-05"), [range("2026-10-01", "2026-10-31")])).toBeNull();
  });
});

describe("availableSince", () => {
  it("is the day after the latest rental ended before the period", () => {
    const existing = [range("2026-09-21", "2026-10-06"), range("2026-08-01", "2026-08-31")];
    const since = availableSince(d("2026-10-17"), existing);
    expect(since?.getMonth()).toBe(9);
    expect(since?.getDate()).toBe(7);
  });

  it("is null when the box was never rented before", () => {
    expect(availableSince(d("2026-10-17"), [range("2026-12-01", null)])).toBeNull();
  });
});

describe("conflictMessage", () => {
  it("explains a later booking and the latest possible end date", () => {
    const message = conflictMessage(range("2026-11-01", null), range("2026-12-01", "2026-12-15"));
    expect(message).toContain("01/12/2026");
    expect(message).toContain("30/11/2026");
  });

  it("explains an existing rental with an end date", () => {
    expect(conflictMessage(range("2026-11-05", "2026-11-08"), range("2026-11-01", "2026-11-10"))).toContain("du 01/11/2026 au 10/11/2026");
  });

  it("asks for an exit date when the existing rental is open-ended", () => {
    expect(conflictMessage(range("2026-11-05", null), range("2026-11-01", null))).toContain("sans date de sortie");
  });
});
