export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function slotTime(start: string, end: string, timeZone?: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "Unknown time";
  const day = s.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  const t = (d: Date) => d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return `${day}, ${t(s)} to ${t(e)}`;
}

const REASON_LABELS: Record<string, string> = {
  outside_service_area: "Outside service area",
  distance_exceeds_limit: "Distance exceeds limit",
  specialty_not_handled: "Specialty item not handled",
  packing_not_offered: "No packing",
  unpacking_not_offered: "No unpacking",
  disassembly_not_offered: "No disassembly",
  storage_not_offered: "No storage",
  insurance_not_offered: "Insurance not offered",
  capacity_exceeded: "Capacity exceeded",
  crew_too_small: "Crew too small",
  long_distance_not_supported: "No long-distance moves",
  carpet_not_offered: "No carpet cleaning",
  inside_appliances_not_offered: "No inside-appliance cleaning",
  windows_not_offered: "No window cleaning",
  walls_not_offered: "No wall cleaning",
  pets_not_accepted: "No pets",
  insufficient_notice: "Needs more notice",
  no_availability: "No availability",
  over_budget: "Over budget",
  quote_invalid: "Quote invalid",
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code.replace(/_/g, " ");
}

export function resaleRange(range: { low: number; high: number } | null): string {
  if (!range) return "No estimate";
  return range.low === range.high ? usd(range.low) : `${usd(range.low)} to ${usd(range.high)}`;
}
