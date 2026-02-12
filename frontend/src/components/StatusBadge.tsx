import { cn } from "@/lib/utils";
import { ComplaintStatus, RideStatus } from "@/types/domain";

type Status = RideStatus | ComplaintStatus;

const statusConfig: Record<Status, { bg: string; dot: string }> = {
  waiting: { bg: "bg-warning/10 text-warning", dot: "bg-warning" },
  assigned: { bg: "bg-info/10 text-info", dot: "bg-info" },
  pickup: { bg: "bg-primary/10 text-primary", dot: "bg-primary" },
  "in-transit": { bg: "bg-info/10 text-info", dot: "bg-info" },
  completed: { bg: "bg-success/10 text-success", dot: "bg-success" },
  cancelled: { bg: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  submitted: { bg: "bg-warning/10 text-warning", dot: "bg-warning" },
  in_review: { bg: "bg-info/10 text-info", dot: "bg-info" },
  resolved: { bg: "bg-success/10 text-success", dot: "bg-success" },
  rejected: { bg: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

const formatStatusLabel = (status: Status) => {
  return status
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const StatusBadge = ({ status }: { status: Status }) => {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold", config.bg)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {formatStatusLabel(status)}
    </span>
  );
};

export default StatusBadge;
