import { cn, decisionColor } from "@/lib/utils";

interface DecisionChipProps {
  decision?: string | null;
  className?: string;
}

export function DecisionChip({ decision, className }: DecisionChipProps) {
  const label = decision?.toUpperCase() ?? "PENDING";
  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border capitalize",
        decisionColor(decision),
        className
      )}
    >
      {label === "MANUAL_REVIEW" ? "REVIEW" : label.toLowerCase()}
    </span>
  );
}
