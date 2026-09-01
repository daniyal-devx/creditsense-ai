import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPKR(amount: number): string {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

export function riskColor(level: string): string {
  switch (level?.toUpperCase()) {
    case "LOW":
      return "text-risk-low";
    case "MEDIUM":
      return "text-risk-medium";
    case "HIGH":
      return "text-risk-high";
    default:
      return "text-gray-400";
  }
}

export function riskBg(level: string): string {
  switch (level?.toUpperCase()) {
    case "LOW":
      return "bg-risk-low/10 border-risk-low/30";
    case "MEDIUM":
      return "bg-risk-medium/10 border-risk-medium/30";
    case "HIGH":
      return "bg-risk-high/10 border-risk-high/30";
    default:
      return "bg-gray-500/10 border-gray-500/30";
  }
}

export function decisionColor(decision: string): string {
  switch (decision?.toUpperCase()) {
    case "APPROVE":
      return "text-risk-low bg-risk-low/10";
    case "REJECT":
      return "text-risk-high bg-risk-high/10";
    case "MANUAL_REVIEW":
      return "text-risk-medium bg-risk-medium/10";
    default:
      return "text-gray-400 bg-gray-500/10";
  }
}
