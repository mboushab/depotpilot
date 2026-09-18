import { cn } from "@/lib/utils";
import { labelStatus } from "@/lib/status-labels";

const statusStyles: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  RESERVED: "bg-violet-50 text-violet-700 ring-violet-200",
  OCCUPIED: "bg-sky-50 text-sky-700 ring-sky-200",
  ACTIVE: "bg-sky-50 text-sky-700 ring-sky-200",
  ENDED: "bg-slate-100 text-slate-700 ring-slate-200",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
  ISSUED: "bg-amber-50 text-amber-700 ring-amber-200",
  DUE_SOON: "bg-orange-50 text-orange-700 ring-orange-200",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200",
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  SCHEDULED: "bg-violet-50 text-violet-700 ring-violet-200",
  IN_PROGRESS: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SYSTEM: "bg-slate-100 text-slate-700 ring-slate-200",
  PAYMENT_DUE: "bg-amber-50 text-amber-700 ring-amber-200",
  PAYMENT_OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200",
  RENTAL_ENDING: "bg-orange-50 text-orange-700 ring-orange-200",
  LOADING_TODAY: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  PARKING_OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200"
};

export function Badge({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[children] ?? "bg-muted text-muted-foreground ring-border",
        className
      )}
    >
      {labelStatus(children)}
    </span>
  );
}
