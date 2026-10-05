import { addDays, startOfDay } from "date-fns";

export type DateRange = { startDate: Date; endDate: Date | null };

// Rentals occupy whole days, both ends included; a missing end date means
// open-ended (a monthly rental nobody has scheduled an exit for yet).
const day = (date: Date) => startOfDay(date).getTime();

export function rangesOverlap(a: DateRange, b: DateRange) {
  const aEnds = a.endDate ? day(a.endDate) : Infinity;
  const bEnds = b.endDate ? day(b.endDate) : Infinity;
  return day(a.startDate) <= bEnds && day(b.startDate) <= aEnds;
}

export function findConflict<T extends DateRange>(candidate: DateRange, existing: T[]): T | undefined {
  return existing.find((rental) => rangesOverlap(candidate, rental));
}

// Last day a box stays free when it's free from `from` onwards: the day
// before the next rental starts, or null when nothing is booked after it.
export function lastAvailableDate(from: Date, existing: DateRange[]): Date | null {
  const upcomingStarts = existing.map((rental) => rental.startDate).filter((start) => day(start) > day(from));
  if (upcomingStarts.length === 0) return null;
  const next = upcomingStarts.reduce((earliest, start) => (day(start) < day(earliest) ? start : earliest));
  return addDays(startOfDay(next), -1);
}

// First day of the current free stretch: the day after the latest rental
// that ended before `from`, or null when the box has never been rented.
export function availableSince(from: Date, existing: DateRange[]): Date | null {
  const ends = existing.map((rental) => rental.endDate).filter((end): end is Date => !!end && day(end) < day(from));
  if (ends.length === 0) return null;
  const latest = ends.reduce((a, b) => (day(a) > day(b) ? a : b));
  return addDays(startOfDay(latest), 1);
}

const fr = (date: Date) => date.toLocaleDateString("fr-FR");

export function conflictMessage(candidate: DateRange, conflict: DateRange) {
  if (day(conflict.startDate) > day(candidate.startDate)) {
    return `Une location commence le ${fr(conflict.startDate)} sur ce box : choisissez une location ponctuelle qui se termine au plus tard le ${fr(addDays(conflict.startDate, -1))}.`;
  }
  if (conflict.endDate) {
    return `Ce box est déjà loué du ${fr(conflict.startDate)} au ${fr(conflict.endDate)}.`;
  }
  return "Ce box est déjà loué sans date de sortie prévue. Définissez une date de sortie sur la location en cours avant d'en réserver une nouvelle.";
}
