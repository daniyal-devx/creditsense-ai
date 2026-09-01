"use client";

import { cn } from "@/lib/utils";

interface ScoreGaugeProps {
  score?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ScoreGauge({ score, size = "md", className }: ScoreGaugeProps) {
  const value = score ?? 0;
  const clamped = Math.max(0, Math.min(1000, value));
  const pct = clamped / 1000;

  const sizes = {
    sm: { width: 96, stroke: 8, font: "text-lg" },
    md: { width: 140, stroke: 10, font: "text-3xl" },
    lg: { width: 200, stroke: 14, font: "text-5xl" },
  };

  const { width, stroke, font } = sizes[size];
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  let color = "#22c55e";
  if (clamped < 650) color = "#ef4444";
  else if (clamped < 800) color = "#f59e0b";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={width} height={width} className="-rotate-90">
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke="#1a2846"
          strokeWidth={stroke}
        />
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-bold text-white", font)}>
          {score === null || score === undefined ? "—" : clamped}
        </span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">/1000</span>
      </div>
    </div>
  );
}
