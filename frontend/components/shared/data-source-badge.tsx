import { cn } from "@/lib/utils";

interface DataSourceBadgeProps {
  mode: string;
  className?: string;
}

export function DataSourceBadge({ mode, className }: DataSourceBadgeProps) {
  const normalized = mode?.toLowerCase() ?? "template";
  const isLive = normalized === "llm";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border",
        isLive
          ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
          : "bg-amber-500/10 border-amber-500/30 text-amber-300",
        className
      )}
    >
      {isLive ? "Live LLM" : "Offline template"}
    </span>
  );
}
