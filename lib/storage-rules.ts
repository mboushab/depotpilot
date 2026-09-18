type RentalLike = {
  status: "RESERVED" | "ACTIVE" | "ENDED" | "CANCELLED";
};

export function deriveUnitStatus(rentals: RentalLike[]) {
  if (rentals.some((rental) => rental.status === "ACTIVE")) {
    return "OCCUPIED" as const;
  }

  return "AVAILABLE" as const;
}

export function occupancyRate(totalUnits: number, occupiedUnits: number) {
  if (totalUnits === 0) {
    return 0;
  }

  return occupiedUnits / totalUnits;
}

export function validateBoxCapacity(count: number) {
  return count === 30;
}

export function canCreateBox(currentCount: number) {
  return currentCount < 30;
}

export function validateLoadingBayCount(count: number) {
  return count === 2;
}

export function isWithinDays(date: Date | null | undefined, days: number, now = new Date()) {
  if (!date) {
    return false;
  }

  const diffMs = date.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

export function isPastDate(date: Date | null | undefined, now = new Date()) {
  return Boolean(date && date.getTime() < now.getTime());
}

export function isRentalUnpaid(invoices: Array<{ status: string; paidCents: number; totalCents: number }>) {
  return invoices.some((invoice) => invoice.status === "OVERDUE" || invoice.paidCents < invoice.totalCents);
}

export const PARKING_FREE_DAYS = 3;

export function parkingDaysElapsed(startDate: Date, now = new Date()) {
  return Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
}

export function isParkingOverdue(startDate: Date, now = new Date()) {
  return parkingDaysElapsed(startDate, now) >= PARKING_FREE_DAYS;
}
