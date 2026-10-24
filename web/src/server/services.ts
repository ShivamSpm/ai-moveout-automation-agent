import "server-only";

import type { BookingResult, CleaningQuote, CleaningRequestInput, FindCleaningQuotesResult } from "@/contracts/cleaning";
import type { ToolContext } from "./auth";
import { currentMove } from "./marketplace";
import {
  approveCleaningBooking,
  createCleaningContext,
  findCleaningQuotes,
  proposeCleaningBooking,
} from "./tools/cleaning";

// Service selection for the renter's move-out: builds the cleaning request
// from the saved move (ZIP, size, move-out day, lease cleaning rules) and runs
// Steven's simulated cleaning marketplace. Nothing real is contacted or booked.

export type ServicesResult =
  | { ok: false; missing: string[] }
  | { ok: true; moveOutDate: string; zip: string; result: FindCleaningQuotesResult };

/** "2026-11-30" at 09:00 in the move's timezone, as an ISO string with offset. */
function localMorning(date: string, timeZone: string): string {
  const probe = new Date(`${date}T17:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return `${date}T09:00:00${offset === "" ? "+00:00" : offset}`;
}

async function cleaningRequest(ctx: ToolContext): Promise<{ missing: string[] } | { request: CleaningRequestInput; moveOutDate: string; zip: string }> {
  const move = await currentMove(ctx);
  const missing = [
    !move.zip && "ZIP code",
    move.bedrooms == null && "bedrooms",
    move.bathrooms == null && "bathrooms",
    !move.move_out_date && "move-out day",
  ].filter(Boolean) as string[];
  if (missing.length) return { missing };

  const [findings, items] = await Promise.all([
    ctx.db.from("lease_findings").select("rule_key, confidence, page").eq("move_id", move.id),
    ctx.db.from("items").select("id", { count: "exact", head: true }).eq("move_id", move.id),
  ]);
  if (findings.error) throw findings.error;
  const found = (key: string) => (findings.data ?? []).some((f) => f.rule_key === key && f.confidence !== "unresolved");
  const refs = (findings.data ?? [])
    .filter((f) => ["carpet_cleaning", "general_cleaning", "wall_repair"].includes(f.rule_key) && f.confidence !== "unresolved")
    .map((f) => `Lease p.${f.page ?? "?"} (${f.rule_key.replaceAll("_", " ")})`)
    .slice(0, 20);

  // The window must start in the future and may span at most 31 days (cleaning tool rules):
  // start a little ahead of now, but no earlier than 30 days before move-out.
  const latestFinish = localMorning(move.move_out_date!, move.timezone || "America/Los_Angeles");
  const finishMs = Date.parse(latestFinish);
  const startMs = Math.max(Date.now() + 15 * 60_000, finishMs - 30 * 86_400_000);
  if (startMs >= finishMs) return { missing: ["a move-out day that hasn't passed yet"] };

  const request: CleaningRequestInput = {
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
      clauseRefs: refs,
    },
    itemsRemaining: { count: items.count ?? 0, hasBulky: false },
    window: { earliestStart: new Date(startMs).toISOString(), latestFinish },
  };
  return { request, moveOutDate: move.move_out_date!, zip: move.zip! };
}

export async function cleaningOptions(ctx: ToolContext): Promise<ServicesResult> {
  const built = await cleaningRequest(ctx);
  if ("missing" in built) return { ok: false, missing: built.missing };
  const result = await findCleaningQuotes(built.request, createCleaningContext(ctx.user.id));
  return { ok: true, moveOutDate: built.moveOutDate, zip: built.zip, result };
}

/**
 * Book the quote the renter approved. Quotes live in per-instance memory, so the
 * search is repeated here and the booking only goes ahead if the same company,
 * slot start and total price come back; otherwise the renter reviews again.
 */
export async function bookCleaning(
  ctx: ToolContext,
  choice: { providerId: string; slotStart: string; totalUsd: number },
): Promise<BookingResult | { status: "changed"; message: string }> {
  const built = await cleaningRequest(ctx);
  if ("missing" in built) return { status: "changed", message: `Add ${built.missing.join(", ")} on My move first.` };
  const cleaning = createCleaningContext(ctx.user.id);
  const fresh = await findCleaningQuotes(built.request, cleaning);
  const quote: CleaningQuote | undefined = fresh.matches.find((q) => q.providerId === choice.providerId);
  const slot = quote?.slots.find((s) => Date.parse(s.start) === Date.parse(choice.slotStart));
  if (!quote || !slot) return { status: "changed", message: "That time is no longer available. Pick another option." };
  if (quote.priceUsd.totalUsd !== choice.totalUsd) {
    return { status: "changed", message: "The estimate changed since you looked. Review the new price before booking." };
  }
  const proposal = await proposeCleaningBooking({ quote, slotId: slot.slotId }, cleaning);
  return approveCleaningBooking(
    { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey },
    cleaning,
  );
}
