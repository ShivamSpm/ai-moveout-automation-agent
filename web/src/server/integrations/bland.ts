import "server-only";

// Bland outbound calls (https://docs.bland.ai/api-v1/post/calls). The key stays
// on the server. Only send() places a real call; callers must have the
// renter's approval for the exact recipient and script first.

const BASE_URL = "https://api.bland.ai/v1";

export class BlandError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "BlandError";
    this.status = status;
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.BLAND_API_KEY);
}

function headers() {
  const key = process.env.BLAND_API_KEY;
  if (!key) throw new BlandError("BLAND_API_KEY is not set");
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}

export interface PlaceCallInput {
  phoneNumber: string; // E.164
  task: string;
  firstSentence: string;
  summaryPrompt: string;
  metadata: Record<string, string>;
}

export async function placeCall(input: PlaceCallInput): Promise<string> {
  const res = await fetch(`${BASE_URL}/calls`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      phone_number: input.phoneNumber,
      task: input.task,
      first_sentence: input.firstSentence,
      // Young American female voice ("Young American Female" in Bland's voice list); override with BLAND_VOICE.
      voice: process.env.BLAND_VOICE?.trim() || "jessica",
      summary_prompt: input.summaryPrompt,
      metadata: input.metadata,
      wait_for_greeting: true,
      record: false, // two-party consent state: transcribe (disclosed), don't record audio
      max_duration: 3, // minutes; short call and cost cap
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; call_id?: string; message?: string };
  if (!res.ok || data.status !== "success" || !data.call_id) {
    throw new BlandError(data.message ?? `Bland returned ${res.status}`, res.status);
  }
  return data.call_id;
}

export interface CallDetails {
  status?: string | null;
  completed?: boolean | null;
  queue_status?: string | null;
  answered_by?: string | null;
  error_message?: string | null;
  summary?: string | null;
  concatenated_transcript?: string | null;
  price?: number | null;
}

export async function getCall(callId: string): Promise<CallDetails> {
  const fields = "status,completed,queue_status,answered_by,error_message,summary,concatenated_transcript,price";
  const res = await fetch(`${BASE_URL}/calls/${encodeURIComponent(callId)}?fields=${fields}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new BlandError(`Bland returned ${res.status}`, res.status);
  return (await res.json()) as CallDetails;
}
