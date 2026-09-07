import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function riskColor(level?: string | null): string {
  switch (level?.toUpperCase()) {
    case "LOW":
      return "text-success";
    case "MEDIUM":
      return "text-warning";
    case "HIGH":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function riskBg(level?: string | null): string {
  switch (level?.toUpperCase()) {
    case "LOW":
      return "bg-success/10 border-success/30";
    case "MEDIUM":
      return "bg-warning/10 border-warning/30";
    case "HIGH":
      return "bg-destructive/10 border-destructive/30";
    default:
      return "bg-muted border-border";
  }
}

export function decisionColor(decision?: string | null): string {
  switch (decision?.toUpperCase()) {
    case "APPROVE":
      return "bg-success/15 text-success border-success/30";
    case "REVIEW":
    case "MANUAL_REVIEW":
      return "bg-warning/15 text-warning border-warning/30";
    case "DECLINE":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function formatPKR(value?: number | null): string {
  if (value === undefined || value === null) return "—";
  return `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value?: number | null, digits = 1): string {
  if (value === undefined || value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}
