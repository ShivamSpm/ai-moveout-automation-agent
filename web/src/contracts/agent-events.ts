import type { BookingProposal, FindCleaningQuotesResult } from "./cleaning";
import type { ProposedInventory } from "./inventory";
import type { FindMovingQuotesResult, MovingBookingProposal } from "./moving";

// What POST /api/chat returns besides the reply text: one event per tool the
// renter agent ran this turn, so the chat UI can render cards. Proposals are
// never approved by the agent; the renter approves them from the card, which
// calls /api/{service}/bookings/{id}/approve with the proposal's payloadHash.

export type AgentEvent =
  | { type: "inventory"; data: ProposedInventory }
  | { type: "cleaning_quotes"; data: FindCleaningQuotesResult }
  | { type: "moving_quotes"; data: FindMovingQuotesResult }
  | { type: "booking_proposal"; service: "cleaning"; data: BookingProposal }
  | { type: "booking_proposal"; service: "moving"; data: MovingBookingProposal }
  | { type: "tool_error"; tool: string; message: string };

export interface ChatResponse {
  reply: string;
  events: AgentEvent[];
  warning?: string;
}

/** POST /api/chat accepts JSON { messages } as before, or multipart with fields "message" (text) and optional "photo" (one image). */
export const CHAT_PHOTO_FIELD = "photo";
export const CHAT_MESSAGE_FIELD = "message";
