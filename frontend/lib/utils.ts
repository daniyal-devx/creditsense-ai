import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function riskColor(level?: string | null): string {
  switch (level?.toUpperCase()) {
    case "LOW":
      return "text-green-400";
    case "MEDIUM":
      return "text-amber-400";
    case "HIGH":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

export function riskBg(level?: string | null): string {
  switch (level?.toUpperCase()) {
    case "LOW":
      return "bg-green-500/10 border-green-500/30";
    case "MEDIUM":
      return "bg-amber-500/10 border-amber-500/30";
    case "HIGH":
      return "bg-red-500/10 border-red-500/30";
    default:
      return "bg-navy-800 border-navy-700";
  }
}

export function decisionColor(decision?: string | null): string {
  switch (decision?.toUpperCase()) {
    case "APPROVE":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "REVIEW":
    case "MANUAL_REVIEW":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "DECLINE":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-navy-800 text-slate-400 border-navy-700";
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
