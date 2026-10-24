import "server-only";

import type { ToolContext } from "./auth";
import {
  EXTRACTION_SYSTEM_PROMPT,
  FINAL_STATUSES,
  SUMMARY_PROMPT,
  buildCallScript,
  mapBlandStatus,
  parseChecklist,
  toE164,
  type CallStatus,
  type ChecklistItem,
} from "./domain/landlord-call";
import * as bland from "./integrations/bland";
import * as openrouter from "./integrations/openrouter";
import { currentMove } from "./marketplace";

// The landlord checklist call: preview the exact call, place it only after the
// renter approves, follow it, and save the checklist the landlord gave as tasks.

export class CallError extends Error {}

const COOLDOWN_MS = 10 * 60_000; // one call per move every 10 minutes

export async function callPreview(ctx: ToolContext) {
  const move = await currentMove(ctx);
  const missing = [
    !move.renter_name && "your name",
    !move.landlord_name && "the landlord's name",
    !move.landlord_phone && "the landlord's phone",
    !move.address_private && "the address",
    !move.move_out_date && "your move-out day",
  ].filter(Boolean) as string[];
  const phone = move.landlord_phone ? toE164(move.landlord_phone) : null;
  if (move.landlord_phone && !phone) missing.push("a landlord phone number we can dial (include the area code)");
  const script =
    missing.length === 0
      ? buildCallScript({
          renterName: move.renter_name!,
          landlordName: move.landlord_name!,
          address: move.address_private!,
          moveOutDate: move.move_out_date!,
        })
      : null;
  return { move, phone, missing, script, configured: bland.isConfigured() };
}

function allowedNumber(phone: string): boolean {
  // Optional demo safety: only call numbers on this list when it's set.
  const list = (process.env.CALL_ALLOWLIST ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  return list.length === 0 || list.includes(phone);
}

export async function startLandlordCall(ctx: ToolContext) {
  const { move, phone, missing, script, configured } = await callPreview(ctx);
  if (!configured) throw new CallError("Calling isn't set up on this site yet.");
  if (missing.length || !phone || !script) throw new CallError(`Add ${missing.join(", ")} on My move first.`);
  if (!allowedNumber(phone)) throw new CallError("This number isn't on the demo call list.");

  const recent = await ctx.db
    .from("landlord_calls")
    .select("id, created_at, status")
    .eq("move_id", move.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent.error) throw recent.error;
  if (recent.data && Date.now() - Date.parse(recent.data.created_at) < COOLDOWN_MS) {
    throw new CallError("A call was placed a few minutes ago. Wait for it to finish before calling again.");
  }

  const scriptText = `${script.firstSentence}\n\n${script.task}`;
  const inserted = await ctx.db
    .from("landlord_calls")
    .insert({ move_id: move.id, to_phone: phone, script: scriptText })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;

  try {
    const callId = await bland.placeCall({
      phoneNumber: phone,
      task: script.task,
      firstSentence: script.firstSentence,
      summaryPrompt: SUMMARY_PROMPT,
      metadata: { landlord_call_id: inserted.data.id },
    });
    await ctx.db.from("landlord_calls").update({ provider_call_id: callId, status: "in_progress" }).eq("id", inserted.data.id);
  } catch (error) {
    const message = error instanceof bland.BlandError ? error.message : "The call could not be placed.";
    await ctx.db.from("landlord_calls").update({ status: "failed", error: message }).eq("id", inserted.data.id);
    throw new CallError(`The call could not be placed: ${message}`);
  }
  return inserted.data.id;
}

export interface CallView {
  id: string;
  status: CallStatus;
  createdAt: string;
  summary: string | null;
  transcript: string | null;
  checklist: ChecklistItem[];
  error: string | null;
}

function toView(row: {
  id: string;
  status: string;
  created_at: string;
  summary: string | null;
  transcript: string | null;
  checklist: unknown;
  error: string | null;
}): CallView {
  return {
    id: row.id,
    status: row.status as CallStatus,
    createdAt: row.created_at,
    summary: row.summary,
    transcript: row.transcript,
    checklist: Array.isArray(row.checklist) ? (row.checklist as ChecklistItem[]) : [],
    error: row.error,
  };
}

export async function latestCall(ctx: ToolContext): Promise<CallView | null> {
  const move = await currentMove(ctx);
  const { data, error } = await ctx.db
    .from("landlord_calls")
    .select("id, status, created_at, summary, transcript, checklist, error")
    .eq("move_id", move.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toView(data) : null;
}

/** Check Bland for a call in progress; when it ends, save the summary, transcript and checklist. */
export async function refreshLandlordCall(ctx: ToolContext, id: string): Promise<CallView> {
  const { data: row, error } = await ctx.db
    .from("landlord_calls")
    .select("id, move_id, status, created_at, summary, transcript, checklist, error, provider_call_id")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (FINAL_STATUSES.includes(row.status as CallStatus) || !row.provider_call_id) return toView(row);

  const details = await bland.getCall(row.provider_call_id);
  const status = mapBlandStatus(details);
  if (status === "in_progress") return toView(row);

  const transcript = details.concatenated_transcript?.trim() || null;
  let checklist: ChecklistItem[] = [];
  let note: string | null = details.error_message ?? null;
  if (status === "completed" && transcript) {
    if (openrouter.isConfigured()) {
      try {
        const reply = await openrouter.complete([
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: `Transcript:\n${transcript.slice(0, 20_000)}` },
        ]);
        checklist = parseChecklist(reply).items;
      } catch {
        note = "The call finished, but the checklist couldn't be extracted. The transcript is below.";
      }
    } else {
      note = "The call finished. Checklist extraction needs OPENROUTER_API_KEY; the transcript is below.";
    }
  }

  // Only the request that moves the row out of in_progress saves tasks.
  const updated = await ctx.db
    .from("landlord_calls")
    .update({
      status,
      summary: details.summary ?? null,
      transcript,
      checklist,
      error: note,
      price_usd: typeof details.price === "number" ? Math.round(details.price * 100) / 100 : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", row.status)
    .select("id, status, created_at, summary, transcript, checklist, error")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) return latestCallById(ctx, id);

  if (checklist.length) {
    const day = new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const tasks = checklist.map((item, i) => ({
      move_id: row.move_id,
      task_key: `landlord-call-${id}-${i + 1}`,
      lane: item.lane,
      title: item.title,
      detail: item.detail,
      due_date: item.due_date,
      source: `Landlord call, ${day}`,
      source_kind: "landlord",
    }));
    const saved = await ctx.db.from("tasks").upsert(tasks, { onConflict: "move_id,task_key" });
    if (saved.error) throw saved.error;
  }
  return toView(updated.data);
}

async function latestCallById(ctx: ToolContext, id: string): Promise<CallView> {
  const { data, error } = await ctx.db
    .from("landlord_calls")
    .select("id, status, created_at, summary, transcript, checklist, error")
    .eq("id", id)
    .single();
  if (error) throw error;
  return toView(data);
}
