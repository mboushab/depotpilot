// Nothing ever updates the persisted `status` column on a loading
// appointment (there's no cron job and no manual action for it), so it
// stays SCHEDULED forever in the DB. Derive the displayed status from the
// current time instead — that's what actually determines whether a slot
// is upcoming, ongoing, or done. Shared by the calendar and the TV screen.
export function deriveLoadingDisplayStatus(start: Date, end: Date, now = new Date()) {
  if (now < start) return "SCHEDULED";
  if (now > end) return "COMPLETED";
  return "IN_PROGRESS";
}
