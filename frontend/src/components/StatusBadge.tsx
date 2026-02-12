import { cn } from "@/lib/utils";

type Status = "waiting" | "assigned" | "pickup" | "in-transit" | "completed" | "cancelled";

const statusConfig: Record<Status, { bg: string; dot: string }> = {
  waiting: { bg: "bg-warning/10 text-warning", dot: "bg-warning" },
  assigned: { bg: "bg-info/10 text-info", dot: "bg-info" },
  pickup: { bg: "bg-primary/10 text-primary", dot: "bg-primary" },
  "in-transit": { bg: "bg-info/10 text-info", dot: "bg-info" },
  completed: { bg: "bg-success/10 text-success", dot: "bg-success" },
  cancelled: { bg: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

const StatusBadge = ({ status }: { status: Status }) => {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold", config.bg)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default StatusBadge;
