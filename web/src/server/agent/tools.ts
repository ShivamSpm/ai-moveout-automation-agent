import { z } from "zod";
import type { AgentEvent } from "@/contracts/agent-events";
import { CleaningRequestSchema, type BookingProposal, type CleaningQuote, type FindCleaningQuotesResult } from "@/contracts/cleaning";
import type { IdentifyItemsResult } from "@/contracts/inventory";
import { MovingRequestSchema, type FindMovingQuotesResult, type MovingBookingProposal, type MovingQuote } from "@/contracts/moving";
import { findQuote, rememberQuotes } from "./quote-store";

// Tools the renter chat agent may call. Owner identity and the photo come from the server
// session, never from model arguments. There is deliberately no approve tool: the renter approves
// a proposal from its card in the UI.

export interface ToolPhoto {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

/** Server-side capabilities behind the tools; injected so tests never reach real services. */
export interface ToolServices {
  identify(photo: ToolPhoto): Promise<IdentifyItemsResult>;
  findCleaning(input: unknown): Promise<FindCleaningQuotesResult>;
  findMoving(input: unknown): Promise<FindMovingQuotesResult>;
  proposeCleaning(input: { quote: CleaningQuote; slotId: string }): Promise<BookingProposal>;
  proposeMoving(input: { quote: MovingQuote; slotId: string }): Promise<MovingBookingProposal>;
}

export interface ToolEnv {
  ownerId: string;
  photo: ToolPhoto | null;
  services: ToolServices;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const ProposeArgsSchema = z.strictObject({ quoteId: z.string().min(1).max(100), slotId: z.string().min(1).max(200) });
const NoArgsSchema = z.object({}).passthrough();

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = { ...(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>) };
  delete generated.$schema;
  return generated;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "identify_items_in_photo",
      description: "Identify the furniture and belongings in the photo the renter attached to this message. Takes no arguments.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "find_cleaning_quotes",
      description: "Get simulated move-out cleaning quotes for the renter's own unit. Ask the renter for any required field you do not know.",
      parameters: jsonSchema(CleaningRequestSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "find_moving_quotes",
      description: "Get simulated moving quotes for the renter's own belongings. Ask the renter for any required field you do not know.",
      parameters: jsonSchema(MovingRequestSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_cleaning_booking",
      description: "Propose a cleaning booking from a quoteId and slotId returned by find_cleaning_quotes. The renter must approve it on the card.",
      parameters: jsonSchema(ProposeArgsSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_moving_booking",
      description: "Propose a moving booking from a quoteId and slotId returned by find_moving_quotes. The renter must approve it on the card.",
      parameters: jsonSchema(ProposeArgsSchema),
    },
  },
];

export interface ToolOutcome {
  /** Sent back to the model as the tool message content. */
  content: string;
  event: AgentEvent | null;
}

const json = (value: unknown) => JSON.stringify(value);

function invalidArgs(error: z.ZodError): ToolOutcome {
  return {
    content: json({ ok: false, error: "invalid_arguments", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })), hint: "Ask the renter for the missing or invalid fields; do not guess." }),
    event: null,
  };
}

function toolError(tool: string, message: string): ToolOutcome {
  return { content: json({ ok: false, error: message }), event: { type: "tool_error", tool, message } };
}

function slots(quote: CleaningQuote | MovingQuote) {
  return quote.slots.slice(0, 3).map((s) => ({ slotId: s.slotId, start: s.start, end: s.end }));
}

function quoteSummary(result: FindCleaningQuotesResult | FindMovingQuotesResult) {
  return {
    ok: true,
    simulated: true,
    matches: result.matches.slice(0, 3).map((q) => ({ quoteId: q.quoteId, provider: q.providerName, totalUsd: q.priceUsd.totalUsd, slots: slots(q) })),
    moreMatches: Math.max(0, result.matches.length - 3),
    excluded: result.excluded.map((e) => ({ provider: e.provider.displayName, reasons: e.reasons.map((r) => r.code) })),
    reasons: result.reasons,
    note: "The renter sees full quote cards. To book, call the propose tool with a quoteId and slotId from this list.",
  };
}

function parseArgs(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Runs one tool call. Never throws for tool failures: they become a tool_error event plus a tool
 * result the model can explain to the renter. */
export async function runTool(name: string, rawArgs: string, env: ToolEnv): Promise<ToolOutcome> {
  const args = parseArgs(rawArgs);
  if (args === undefined) return { content: json({ ok: false, error: "arguments were not valid JSON" }), event: null };
  try {
    switch (name) {
      case "identify_items_in_photo": {
        const parsed = NoArgsSchema.safeParse(args);
        if (!parsed.success) return invalidArgs(parsed.error);
        if (!env.photo) return { content: json({ ok: false, error: "No photo is attached to this message. Ask the renter to attach one." }), event: null };
        const result = await env.services.identify(env.photo);
        if (!result.ok) return toolError(name, `Could not identify items: ${result.failure.kind}`);
        const inventory = result.inventory;
        return {
          content: json({ ok: true, roomType: inventory.roomType, items: inventory.items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size_class })), note: "Items are proposed; the renter confirms them on the card." }),
          event: { type: "inventory", data: inventory },
        };
      }
      case "find_cleaning_quotes": {
        const parsed = CleaningRequestSchema.safeParse(args);
        if (!parsed.success) return invalidArgs(parsed.error);
        const result = await env.services.findCleaning(parsed.data);
        rememberQuotes(env.ownerId, result.matches.map((quote) => ({ service: "cleaning" as const, quote })));
        return { content: json(quoteSummary(result)), event: { type: "cleaning_quotes", data: result } };
      }
      case "find_moving_quotes": {
        const parsed = MovingRequestSchema.safeParse(args);
        if (!parsed.success) return invalidArgs(parsed.error);
        const result = await env.services.findMoving(parsed.data);
        rememberQuotes(env.ownerId, result.matches.map((quote) => ({ service: "moving" as const, quote })));
        return { content: json(quoteSummary(result)), event: { type: "moving_quotes", data: result } };
      }
      case "propose_cleaning_booking":
      case "propose_moving_booking": {
        const parsed = ProposeArgsSchema.safeParse(args);
        if (!parsed.success) return invalidArgs(parsed.error);
        const service = name === "propose_cleaning_booking" ? "cleaning" : "moving";
        const stored = findQuote(env.ownerId, service, parsed.data.quoteId);
        if (!stored) return toolError(name, `Unknown ${service} quoteId ${parsed.data.quoteId}; search for quotes first.`);
        const after = { ok: true, status: "pending_renter_approval", note: "Nothing is booked yet. The renter must approve this proposal on the card." };
        if (stored.service === "cleaning") {
          const proposal = await env.services.proposeCleaning({ quote: stored.quote, slotId: parsed.data.slotId });
          return { content: json(after), event: { type: "booking_proposal", service: "cleaning", data: proposal } };
        }
        const proposal = await env.services.proposeMoving({ quote: stored.quote, slotId: parsed.data.slotId });
        return { content: json(after), event: { type: "booking_proposal", service: "moving", data: proposal } };
      }
      default:
        return toolError(name, `Unknown tool ${name}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error);
    const message = error instanceof Error && error.name === "SimulatedServiceError" ? error.message : "The tool failed unexpectedly";
    return toolError(name, message);
  }
}
