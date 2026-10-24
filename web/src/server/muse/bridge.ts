import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { serviceClient, type Db } from "../supabase";

// The Muse bridge. The renter's Muse agent holds their Facebook account and
// performs posts and messages under Muse's own permission prompts. This app
// only hands it work the renter already approved here, and records what Muse
// reports back. Every operation is scoped to the owner resolved from the
// connector token; nothing here accepts an owner id from the caller.

export class BridgeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface BridgeOwner {
  ownerId: string;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Called with the renter's own session. Returns the token once; only its hash is stored.
export async function createConnectorToken(db: Db, label = "Muse") {
  const token = `vac_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await db
    .from("connector_tokens")
    .insert({ label, token_hash: hashToken(token), token_hint: token.slice(-4) })
    .select("id, label, token_hint, created_at")
    .single();
  if (error) throw new BridgeError(error.message, 500);
  return { token, ...data };
}

export async function resolveConnector(authorization: string | null): Promise<BridgeOwner> {
  const token = authorization?.match(/^Bearer\s+(vac_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) throw new BridgeError("A connector token is required (Authorization: Bearer vac_…)", 401);
  const { data, error } = await serviceClient().rpc("resolve_connector_token", {
    p_token_hash: hashToken(token),
  });
  if (error) throw new BridgeError("Could not verify the connector token", 500);
  if (!data) throw new BridgeError("Unknown or revoked connector token", 401);
  return { ownerId: data };
}

const INSTRUCTIONS = {
  "listing.publish":
    "Publish this exact listing on Facebook Marketplace from the renter's own account. Use the title, description and price as given, and attach exactly the photos in photoUrls (signed links that expire in 15 minutes; call list_tasks again for fresh ones). If missingPhotos is above 0, do not publish; tell the renter an approved photo is unavailable. Do not add other photos, an exact address, phone number or other personal details. Follow Muse's own approval prompt before publishing. Then report the result (MCP muse_report_result, or A2A op 'report') with the listing URL, or status 'failed' with the reason. If you cannot tell whether it was published, report 'unknown'; do not publish twice.",
  "buyer.reply":
    "Send this exact message to the named buyer in the Marketplace conversation for this listing. Do not change wording, add commitments or share an address the message does not contain. Follow Muse's approval prompt, then report the result.",
  "pickup.confirm":
    "Send this exact pickup confirmation to the named buyer. The item is now held for this buyer only; do not confirm a pickup to anyone else. Follow Muse's approval prompt, then report the result.",
} as const;

type QueueRow = {
  action_id: string;
  kind: string;
  title: string;
  status: string;
  payload: unknown;
  payload_hash: string;
  approved_at: string | null;
  attempts: number;
  photo_paths: string[];
};

async function signedPhotos(ownerId: string, paths: string[]) {
  const own = paths.filter((p) => p.startsWith(`${ownerId}/`));
  if (!own.length) return [];
  const { data } = await serviceClient().storage.from("move-files").createSignedUrls(own, 15 * 60);
  return (data ?? []).flatMap((d) => (d.signedUrl ? [d.signedUrl] : []));
}

type PhotoRef = { documentId: string; sha256: string };

// The photos bound into an approved listing payload: only this owner's
// documents whose stored hash still matches what the renter approved.
async function approvedPhotos(ownerId: string, refs: PhotoRef[]) {
  if (!refs.length) return [];
  const { data } = await serviceClient()
    .from("documents")
    .select("id, storage_path, sha256")
    .eq("owner_id", ownerId)
    .in("id", refs.map((r) => r.documentId));
  return Promise.all(
    refs.map(async (ref) => {
      const doc = data?.find((d) => d.id === ref.documentId && d.sha256 === ref.sha256);
      const [url] = doc ? await signedPhotos(ownerId, [doc.storage_path]) : [];
      return { ...ref, url: url ?? null };
    }),
  );
}

function payloadPhotos(payload: unknown): PhotoRef[] | null {
  const photos = (payload as { photos?: unknown } | null)?.photos;
  return Array.isArray(photos) ? (photos as PhotoRef[]) : null;
}

export async function listTasks({ ownerId }: BridgeOwner) {
  const { data, error } = await serviceClient().rpc("muse_queue", { p_owner_id: ownerId });
  if (error) throw new BridgeError(error.message, 500);
  return Promise.all(
    (data as QueueRow[]).map(async (row) => {
      const refs = payloadPhotos(row.payload);
      // Newer listing payloads name their approved photos; older ones get all item photos.
      const photos = refs ? await approvedPhotos(ownerId, refs) : null;
      return {
        taskId: row.action_id,
        kind: row.kind,
        title: row.title,
        state: row.status === "approved" ? "ready" : row.status === "executing" ? "claimed" : "outcome_unknown",
        payload: row.payload,
        payloadHash: row.payload_hash,
        approvedAt: row.approved_at,
        photoUrls: photos ? photos.flatMap((p) => (p.url ? [p.url] : [])) : await signedPhotos(ownerId, row.photo_paths),
        ...(photos ? { photos, missingPhotos: photos.filter((p) => !p.url).length } : {}),
        instructions: INSTRUCTIONS[row.kind as keyof typeof INSTRUCTIONS],
      };
    }),
  );
}

export async function getTask(owner: BridgeOwner, taskId: string) {
  const task = (await listTasks(owner)).find((t) => t.taskId === taskId);
  if (!task) throw new BridgeError("No approved task with that id for this renter", 404);
  return task;
}

export const ClaimInput = z.object({ taskId: z.uuid(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/) });

// Exactly-once: a second claim of the same task returns claimed=false.
export async function claimTask({ ownerId }: BridgeOwner, input: z.infer<typeof ClaimInput>) {
  const { data, error } = await serviceClient().rpc("muse_claim", {
    p_owner_id: ownerId,
    p_action_id: input.taskId,
    p_payload_hash: input.payloadHash,
  });
  if (error) {
    if (error.code === "23505") throw new BridgeError("This item is already held for another buyer", 409);
    throw new BridgeError(error.message, 500);
  }
  if (!data?.id) {
    return {
      claimed: false as const,
      reason:
        "Not claimable: already claimed or finished, changed since approval, or not approved. Call list_tasks for the current state and do not perform it again.",
    };
  }
  return { claimed: true as const, taskId: data.id, attempt: data.attempts };
}

export const ReportInput = z.object({
  taskId: z.uuid(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["succeeded", "failed", "unknown"]),
  externalUrl: z.url().max(500).optional(),
  externalRef: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

const MARKETPLACE_URL = /^https:\/\/(www\.|m\.)?facebook\.com\/marketplace\/item\/\d+\/?/;

export async function reportResult({ ownerId }: BridgeOwner, input: z.infer<typeof ReportInput>) {
  const task = await serviceClient()
    .rpc("muse_queue", { p_owner_id: ownerId })
    .then(({ data }) => (data as QueueRow[] | null)?.find((t) => t.action_id === input.taskId));
  if (task?.kind === "listing.publish" && input.status === "succeeded") {
    if (!input.externalUrl || !MARKETPLACE_URL.test(input.externalUrl)) {
      throw new BridgeError(
        "A succeeded listing needs its Facebook Marketplace URL (https://www.facebook.com/marketplace/item/<id>)",
      );
    }
  }
  const { data, error } = await serviceClient().rpc("muse_report", {
    p_owner_id: ownerId,
    p_action_id: input.taskId,
    p_payload_hash: input.payloadHash,
    p_status: input.status,
    p_external_url: input.externalUrl,
    p_external_ref: input.externalRef,
    p_note: input.note,
  });
  if (error) throw new BridgeError(error.message, error.code === "P0002" ? 409 : 500);
  return { taskId: data.id, status: data.status, recordedAs: "delegated: reported by Muse, not independently verified" };
}

export const BuyerMessageInput = z.object({
  listingId: z.uuid(),
  buyerName: z.string().min(1).max(100),
  message: z.string().min(1).max(4000),
  threadRef: z.string().min(1).max(200),
});

export async function relayBuyerMessage({ ownerId }: BridgeOwner, input: z.infer<typeof BuyerMessageInput>) {
  const { data, error } = await serviceClient().rpc("muse_buyer_message", {
    p_owner_id: ownerId,
    p_listing_id: input.listingId,
    p_buyer_label: input.buyerName,
    p_body: input.message,
    p_thread_ref: input.threadRef,
  });
  if (error) throw new BridgeError(error.message, error.code === "P0002" ? 404 : 500);
  return {
    conversationId: data,
    next: "Recorded for the renter. Do not reply or promise anything yet; an approved reply will appear in list_tasks.",
  };
}

export async function listListings({ ownerId }: BridgeOwner) {
  const { data, error } = await serviceClient().rpc("muse_listings", { p_owner_id: ownerId });
  if (error) throw new BridgeError(error.message, 500);
  return data;
}
