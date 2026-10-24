import "server-only";
import type { ToolContext } from "./auth";
import { getChecklist, getLeaseFindings, listDocuments } from "./connector/renter";
import { getActivity } from "./connector/activity";

// Shared connector readers retain RLS. Account dashboard never initializes a move.
export async function getMoveView(ctx: ToolContext) {
  const [move, tasks, findings, documents, activity, actions, items, listings, chat, visibleTasks] = await Promise.all([
    ctx.db.from("moves").select("*").eq("owner_id", ctx.user.id).order("created_at").limit(1).maybeSingle(),
    getChecklist(ctx, {}, true), getLeaseFindings(ctx, undefined, true), listDocuments(ctx, undefined, true), getActivity(ctx, { limit: 15 }),
    ctx.db.from("actions").select("id,title,status,kind").eq("owner_id", ctx.user.id).eq("status", "pending_review"),
    ctx.db.from("items").select("id,name,status,disposition,ask_cents").eq("owner_id", ctx.user.id).order("created_at"),
    ctx.db.from("listings").select("id,title,status,mode").eq("owner_id", ctx.user.id).order("created_at"),
    ctx.db.from("chat_messages").select("role,content").eq("owner_id", ctx.user.id).order("created_at", { ascending: false }).limit(30),
    getChecklist(ctx, {}),
  ]);
  for (const r of [move, actions, items, listings, chat]) if (r.error) throw new Error(r.error.message);
  return { move: move.data, tasks, sharedTasks: visibleTasks.filter(t => !tasks.some(owned => owned.id === t.id)), findings, documents, activity, approvals: actions.data ?? [], items: items.data ?? [], listings: listings.data ?? [], chat: (chat.data ?? []).reverse() };
}
export type MoveView = Awaited<ReturnType<typeof getMoveView>>;

// Stable entry points for the four MCP readers. Reuse their implementations and
// output shapes until the parallel connector lane switches its imports here.
export { getChecklist, getLeaseFindings, moveStatus } from "./connector/renter";
export { getActivity } from "./connector/activity";
