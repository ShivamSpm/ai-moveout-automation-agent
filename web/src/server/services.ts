import "server-only";

import type { CleaningQuote, CleaningRequestInput, FindCleaningQuotesResult } from "@/contracts/cleaning";
import type { FindMovingQuotesResult, MovingQuote, MovingRequestInput } from "@/contracts/moving";
import type { ToolContext } from "./auth";
import { currentMove } from "./marketplace";
import { approveCleaningBooking, createCleaningContext, findCleaningQuotes, proposeCleaningBooking } from "./tools/cleaning";
import { approveMovingBooking, createMovingContext, findMovingQuotes, proposeMovingBooking } from "./tools/moving";

// Cleaning and moving company selection for the renter's move-out. Requests are
// built from the saved move and run against the simulated marketplaces (Steven's
// cleaning and moving tools); nothing real is contacted or booked. The renter's
// pick is saved in service_selections.

export type ServiceKind = "cleaning" | "moving";

export interface ServiceOption {
  providerId: string;
  providerName: string;
  totalUsd: number;
  rating: number;
  reviewCount: number;
  firstSlot: string | null;
  highlights: string[];
}

export interface ServiceSection {
  kind: ServiceKind;
  missing: string[]; // move details needed before quotes can run
  options: ServiceOption[]; // cheapest first, the agent's pick is options[0]
  skipped: { name: string; totalUsd: number | null; why: string }[];
  disclaimer: string;
  assumptions: string[];
  emptyReasons: string[];
}

export interface SavedSelection {
  kind: ServiceKind;
  providerId: string;
  providerName: string;
  totalUsd: number;
  slotStart: string | null;
  confirmationCode: string | null;
}

const DAY_MS = 86_400_000;

/** "2026-11-30" at 09:00 in the move's timezone, as an ISO string with offset. */
function localMorning(date: string, timeZone: string): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T17:00:00Z`))
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return `${date}T09:00:00${offset}`;
}

type Move = Awaited<ReturnType<typeof currentMove>>;

/** Both tools need a window that starts in the future and spans at most ~31 days. */
function serviceWindow(move: Move) {
  const latestFinish = localMorning(move.move_out_date!, move.timezone || "America/Los_Angeles");
  const finishMs = Date.parse(latestFinish);
  const startMs = Math.max(Date.now() + 15 * 60_000, finishMs - 30 * DAY_MS);
  return startMs >= finishMs ? null : { earliestStart: new Date(startMs).toISOString(), latestFinish };
}

function missingDetails(move: Move): string[] {
  return [
    !move.zip && "ZIP code",
    move.bedrooms == null && "bedrooms",
    move.bathrooms == null && "bathrooms",
    !move.move_out_date && "move-out day",
  ].filter(Boolean) as string[];
}

async function cleaningRequest(ctx: ToolContext, move: Move): Promise<CleaningRequestInput | null> {
  const window = serviceWindow(move);
  if (!window) return null;
  const [findings, items] = await Promise.all([
    ctx.db.from("lease_findings").select("rule_key, confidence, page").eq("move_id", move.id),
    ctx.db.from("items").select("id", { count: "exact", head: true }).eq("move_id", move.id),
  ]);
  if (findings.error) throw findings.error;
  const rows = (findings.data ?? []).filter((f) => f.confidence !== "unresolved");
  const found = (key: string) => rows.some((f) => f.rule_key === key);
  return {
    requesterRole: "renter",
    serviceArea: { kind: "zip", zip: move.zip! },
    bedrooms: move.bedrooms!,
    bathrooms: Number(move.bathrooms),
    ...(move.sqft ? { squareFeet: move.sqft } : {}),
    leaseRequirements: {
      deepClean: true,
      insideAppliances: found("general_cleaning"),
      carpetCleaning: found("carpet_cleaning"),
      walls: found("wall_repair"),
      windows: false,
      clauseRefs: rows
        .filter((f) => ["carpet_cleaning", "general_cleaning", "wall_repair"].includes(f.rule_key))
        .map((f) => `Lease p.${f.page ?? "?"} (${f.rule_key.replaceAll("_", " ")})`)
        .slice(0, 20),
    },
    itemsRemaining: { count: items.count ?? 0, hasBulky: false },
    window,
  };
}

// No destination is collected yet, so a move uses stated, typical assumptions.
const MOVING_ASSUMPTIONS = ["Same-area move, about 5 miles", "2nd floor, no elevator, both ends", "Typical load for your bedrooms"];

function movingRequest(move: Move): MovingRequestInput | null {
  const window = serviceWindow(move);
  if (!window) return null;
  const rooms = Math.max(1, move.bedrooms ?? 1);
  return {
    requesterRole: "renter",
    origin: { zip: move.zip!, floor: 2, hasElevator: false, parkingPermitNeeded: true },
    destination: { zip: move.zip!, floor: 2, hasElevator: false },
    distanceMiles: 5,
    moveWindow: window,
    boxes: { small: 8 * rooms, medium: 12 * rooms, large: 4 * rooms, wardrobe: rooms },
    furniture: { small: 5 * rooms, medium: 3 * rooms, large: 2 * rooms, extraLarge: rooms },
  };
}

const CLEANING_WHY: Record<string, string> = {
  outside_service_area: "doesn't serve your ZIP",
  carpet_not_offered: "no carpet cleaning",
  inside_appliances_not_offered: "doesn't clean inside appliances",
  walls_not_offered: "no wall cleaning",
  no_availability: "can't come before your move-out day",
  insufficient_notice: "needs more notice",
  over_budget: "over budget",
};
const MOVING_WHY: Record<string, string> = {
  outside_service_area: "doesn't serve your ZIP",
  capacity_exceeded: "too small for your load",
  crew_too_small: "crew too small",
  no_availability: "can't move you before your move-out day",
  insufficient_notice: "needs more notice",
  over_budget: "over budget",
};

function cleaningSection(result: FindCleaningQuotesResult): ServiceSection {
  return {
    kind: "cleaning",
    missing: [],
    options: result.matches.map(toOption),
    skipped: result.excluded.map((e) => ({
      name: e.provider.displayName,
      totalUsd: e.quote?.priceUsd.totalUsd ?? null,
      why: e.reasons.map((r) => CLEANING_WHY[r.code] ?? r.detail).join(", "),
    })),
    disclaimer: result.disclaimer,
    assumptions: [],
    emptyReasons: result.reasons,
  };
}

function movingSection(result: FindMovingQuotesResult): ServiceSection {
  return {
    kind: "moving",
    missing: [],
    options: result.matches.map(toOption),
    skipped: result.excluded.map((e) => ({
      name: e.provider.displayName,
      totalUsd: e.quote?.priceUsd.totalUsd ?? null,
      why: e.reasons.map((r) => MOVING_WHY[r.code] ?? r.detail).join(", "),
    })),
    disclaimer: result.disclaimer,
    assumptions: MOVING_ASSUMPTIONS,
    emptyReasons: result.reasons,
  };
}

function toOption(q: CleaningQuote | MovingQuote): ServiceOption {
  return {
    providerId: q.providerId,
    providerName: q.providerName,
    totalUsd: q.priceUsd.totalUsd,
    rating: q.rating.stars,
    reviewCount: q.rating.reviewCount,
    firstSlot: q.slots[0]?.start ?? null,
    highlights: q.inclusions.slice(0, 3),
  };
}

function blank(kind: ServiceKind, missing: string[]): ServiceSection {
  return { kind, missing, options: [], skipped: [], disclaimer: "", assumptions: [], emptyReasons: [] };
}

export async function serviceOptions(ctx: ToolContext) {
  const move = await currentMove(ctx);
  const missing = missingDetails(move);
  const saved = await savedSelections(ctx, move.id);
  if (missing.length) return { moveOutDate: move.move_out_date, sections: [blank("cleaning", missing), blank("moving", missing)], saved };

  const [cReq, mReq] = [await cleaningRequest(ctx, move), movingRequest(move)];
  const past = ["a move-out day that hasn't passed yet"];
  const [cleaning, moving] = await Promise.all([
    cReq ? findCleaningQuotes(cReq, createCleaningContext(ctx.user.id)).then(cleaningSection) : blank("cleaning", past),
    mReq ? findMovingQuotes(mReq, createMovingContext(ctx.user.id)).then(movingSection) : blank("moving", past),
  ]);
  return { moveOutDate: move.move_out_date, sections: [cleaning, moving], saved };
}

async function savedSelections(ctx: ToolContext, moveId: string): Promise<SavedSelection[]> {
  const { data, error } = await ctx.db
    .from("service_selections")
    .select("kind, provider_id, provider_name, total_usd, slot_start, confirmation_code")
    .eq("move_id", moveId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    kind: r.kind as ServiceKind,
    providerId: r.provider_id,
    providerName: r.provider_name,
    totalUsd: Number(r.total_usd),
    slotStart: r.slot_start,
    confirmationCode: r.confirmation_code,
  }));
}

/**
 * Save the renter's pick. Quotes live in per-instance memory, so the search is
 * repeated here; the pick is only saved (and simulated-booked for its first open
 * slot) when the same company and total price come back.
 */
export async function selectService(
  ctx: ToolContext,
  kind: ServiceKind,
  choice: { providerId: string; totalUsd: number },
): Promise<{ ok: true; saved: SavedSelection } | { ok: false; message: string }> {
  const move = await currentMove(ctx);
  const missing = missingDetails(move);
  if (missing.length) return { ok: false, message: `Add ${missing.join(", ")} on My move first.` };

  let quote: CleaningQuote | MovingQuote | undefined;
  let code: string | null = null;
  if (kind === "cleaning") {
    const req = await cleaningRequest(ctx, move);
    if (!req) return { ok: false, message: "Your move-out day has passed." };
    const c = createCleaningContext(ctx.user.id);
    const fresh = await findCleaningQuotes(req, c);
    const q = fresh.matches.find((m) => m.providerId === choice.providerId);
    if (!q || q.priceUsd.totalUsd !== choice.totalUsd || !q.slots[0]) return changed();
    const proposal = await proposeCleaningBooking({ quote: q, slotId: q.slots[0].slotId }, c);
    const result = await approveCleaningBooking({ proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }, c);
    if (result.status !== "simulated_confirmed") return { ok: false, message: result.message };
    quote = q;
    code = result.confirmationCode;
  } else {
    const req = movingRequest(move);
    if (!req) return { ok: false, message: "Your move-out day has passed." };
    const c = createMovingContext(ctx.user.id);
    const fresh = await findMovingQuotes(req, c);
    const q = fresh.matches.find((m) => m.providerId === choice.providerId);
    if (!q || q.priceUsd.totalUsd !== choice.totalUsd || !q.slots[0]) return changed();
    const proposal = await proposeMovingBooking({ quote: q, slotId: q.slots[0].slotId }, c);
    const result = await approveMovingBooking({ proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }, c);
    if (result.status !== "simulated_confirmed") return { ok: false, message: result.message };
    quote = q;
    code = result.confirmationCode;
  }

  const row = {
    move_id: move.id,
    kind,
    provider_id: quote.providerId,
    provider_name: quote.providerName,
    total_usd: quote.priceUsd.totalUsd,
    slot_start: quote.slots[0]?.start ?? null,
    confirmation_code: code,
    selected_at: new Date().toISOString(),
  };
  const { error } = await ctx.db.from("service_selections").upsert(row, { onConflict: "move_id,kind" });
  if (error) throw error;
  return {
    ok: true,
    saved: { kind, providerId: row.provider_id, providerName: row.provider_name, totalUsd: row.total_usd, slotStart: row.slot_start, confirmationCode: code },
  };
}

function changed(): { ok: false; message: string } {
  return { ok: false, message: "That option changed or is no longer available. Refresh to see the latest prices." };
}
