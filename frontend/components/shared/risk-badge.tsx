import { cn, riskColor, riskBg } from "@/lib/utils";

interface RiskBadgeProps {
  level?: string | null;
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
        riskBg(level),
        riskColor(level),
        className
      )}
    >
      {level?.toLowerCase() ?? "unknown"}
    </span>
  );
}
