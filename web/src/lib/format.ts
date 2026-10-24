import type { Lane } from "./schedule";

export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function longDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function usd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export const laneMeta: Record<Lane, { label: string; color: string; tag: string }> = {
  landlord: { label: "Landlord", color: "var(--sky)", tag: "01" },
  cleaning: { label: "Cleaning", color: "var(--leaf)", tag: "02" },
  moving: { label: "Moving", color: "var(--sun)", tag: "03" },
  selling: { label: "Selling", color: "var(--stamp)", tag: "04" },
  admin: { label: "Admin", color: "var(--muted)", tag: "05" },
};
