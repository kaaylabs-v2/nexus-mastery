import { cn } from "@/lib/utils";
import { type MasteryStatus, type Trend, getStatusColor, getStatusLabel, getTrendIcon } from "@/lib/mock-data";

interface StatusBadgeProps {
  status: MasteryStatus;
  trend?: Trend;
  className?: string;
}

export function StatusBadge({ status, trend, className }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  const trendIcon = trend ? getTrendIcon(trend) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        backgroundColor: `${color}15`,
        color: color,
      }}
    >
      {label}
      {trendIcon && <span>{trendIcon}</span>}
    </span>
  );
}
