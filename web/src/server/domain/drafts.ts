// Deterministic first drafts. The renter edits and approves every one before
// anything leaves the app. Drafts state only what the renter provided or the
// lease says; they never claim landlord agreement or legal entitlements.

import type { ActionPayload } from "@/contracts";

export interface MoveFacts {
  tenantName: string;
  landlordName: string | null;
  landlordEmail: string | null;
  addressPrivate: string | null;
  areaLabel: string | null;
  moveOutDate: string | null; // YYYY-MM-DD
  timezone: string;
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function draftNoticeEmail(
  move: MoveFacts,
  opts: { noticeDays: number; noticeClause: string | null; inspectionDate?: string },
): ActionPayload<"gmail.send"> {
  if (!move.landlordEmail) throw new Error("Add your landlord's email first");
  if (!move.moveOutDate) throw new Error("Add your move-out date first");
  const where = move.addressPrivate ?? move.areaLabel ?? "my unit";
  const greeting = move.landlordName ? `Hi ${move.landlordName.split(" ")[0]},` : "Hello,";
  const clause = opts.noticeClause ? ` (${opts.noticeClause})` : "";
  const lines = [
    greeting,
    "",
    `This is my written notice that I will be moving out of ${where} on ${longDate(move.moveOutDate)}. My lease${clause} asks for ${opts.noticeDays} days' written notice.`,
    "",
    opts.inspectionDate
      ? `I'd also like to schedule a walk-through before I move out so I can take care of anything you'd want fixed. Would ${longDate(opts.inspectionDate)} work for you? I'm happy to find another time.`
      : "I'd also like to schedule a walk-through before I move out so I can take care of anything you'd want fixed. What times work for you?",
    "",
    "Please let me know how you'd like the keys returned. I'll send my forwarding address before move-out.",
    "",
    "Thank you,",
    move.tenantName,
  ];
  return {
    to: [move.landlordEmail],
    cc: [],
    subject: `Notice to vacate: move-out on ${longDate(move.moveOutDate)}`,
    body: lines.join("\n"),
  };
}

// Builds an RFC 3339 local datetime with the zone's offset on that date.
export function zonedIso(date: string, time: string, timeZone: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(guess);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name === "GMT" ? "+00:00" : name.replace("GMT", "");
  return `${date}T${time}:00${offset}`;
}

export function draftInspectionEvent(
  move: MoveFacts,
  date: string,
  time = "10:00",
): ActionPayload<"calendar.create"> {
  const start = zonedIso(date, time, move.timezone);
  const [h, m] = time.split(":").map(Number);
  const endTime = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return {
    summary: "Pre-move-out walk-through (requested)",
    description:
      "Requested in the notice email. Not confirmed by the landlord until they reply. Take photos of every room.",
    start,
    end: zonedIso(date, endTime, move.timezone),
    timeZone: move.timezone,
    attendees: [],
    sendInvitations: false,
  };
}

export function draftDeadlineEvent(
  move: MoveFacts,
  title: string,
  date: string,
  detail: string,
): ActionPayload<"calendar.create"> {
  return {
    summary: title,
    description: detail,
    start: zonedIso(date, "09:00", move.timezone),
    end: zonedIso(date, "09:30", move.timezone),
    timeZone: move.timezone,
    attendees: [],
    sendInvitations: false,
  };
}

export function draftListing(item: {
  name: string;
  condition: string | null;
  description: string | null;
  askCents: number | null;
  disposition: "sell" | "donate";
}, areaLabel: string | null) {
  const free = item.disposition === "donate" || !item.askCents;
  const lines = [
    item.description ?? item.name,
    item.condition ? `Condition: ${item.condition}.` : null,
    areaLabel ? `Pickup near ${areaLabel}. Exact location shared once a pickup time is agreed.` : "Pickup only. Location shared once a pickup time is agreed.",
    free ? "Free to whoever can pick it up." : null,
  ].filter(Boolean);
  return {
    title: free ? `FREE: ${item.name}` : item.name,
    body: lines.join("\n"),
    priceCents: free ? 0 : item.askCents!,
  };
}

// True when text reveals the exact address. Computed by the server, never by the model.
export function disclosesAddress(text: string, addressPrivate: string | null): boolean {
  if (!addressPrivate) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // House number plus the first street word, so "100 Example St" matches
  // "100 Example Street, Apt 2".
  const street = norm(addressPrivate).split(" ").slice(0, 2).join(" ");
  return street.length >= 5 && norm(text).includes(street);
}
