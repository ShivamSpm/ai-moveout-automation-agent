import { z } from 'zod';
import type { ToolContext } from '../auth';
import { appLinks } from '../links';
import { marketplaceState } from '../marketplace';
import { getActivity } from './activity';

export const LinksSchema = z.record(z.string(), z.string());
export const TaskStatus = z.enum(['todo', 'done', 'skipped']);
export const ChecklistInput = z.object({ lane: z.enum(['landlord', 'cleaning', 'moving', 'selling', 'admin']).optional(), status: TaskStatus.optional(), taskId: z.uuid().optional() });
export const TaskSchema = z.object({ id: z.string(), title: z.string(), detail: z.string().nullable(), lane: z.string(), due_date: z.string().nullable(), status: z.string(), source: z.string().nullable(), source_kind: z.string(), page: z.number().nullable() });
export async function getChecklist(ctx: ToolContext, input: z.infer<typeof ChecklistInput>) {
  let query = ctx.db.from('tasks').select('id, title, detail, lane, due_date, status, source, source_kind').order('due_date', { ascending: true, nullsFirst: false }).order('id');
  if (input.lane) query = query.eq('lane', input.lane);
  if (input.status) query = query.eq('status', input.status);
  if (input.taskId) query = query.eq('id', input.taskId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(t => ({ ...t, page: t.source_kind === 'lease' ? Number(t.source?.match(/\bp(?:age|\.)?\s*(\d+)\b/i)?.[1]) || null : null }));
}
export async function setTaskStatus(ctx: ToolContext, taskId: string, status: z.infer<typeof TaskStatus>) {
  const { data, error } = await ctx.db.from('tasks').update({ status }).eq('id', taskId).select('id, status').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Task not found or not owned by this renter');
  return data;
}
export const DocumentSchema = z.object({ id: z.string(), name: z.string().nullable(), kind: z.string(), uploaded_at: z.string(), page_count: z.number().nullable(), short_hash: z.string() });
export async function listDocuments(ctx: ToolContext, documentId?: string) {
  let query = ctx.db.from('documents').select('id, original_name, kind, uploaded_at, page_count, sha256').order('uploaded_at', { ascending: false });
  if (documentId) query = query.eq('id', documentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(d => ({ id: d.id, name: d.original_name, kind: d.kind, uploaded_at: d.uploaded_at, page_count: d.page_count, short_hash: d.sha256.slice(0, 12) }));
}
export const FindingSchema = z.object({ id: z.string(), document_id: z.string().nullable(), rule: z.string(), value: z.unknown(), quote: z.string().nullable(), page: z.number().nullable(), confidence: z.string(), confirmed: z.boolean(), not_found: z.boolean() });
export async function getLeaseFindings(ctx: ToolContext, documentId?: string) {
  let query = ctx.db.from('lease_findings').select('id, document_id, rule_key, value, quote, page, confidence, confirmed').order('created_at');
  if (documentId) query = query.eq('document_id', documentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ rule_key, ...f }) => ({ ...f, rule: rule_key, not_found: f.value === null && !f.quote }));
}
export async function moveStatus(ctx: ToolContext) {
  const [state, tasks, activity] = await Promise.all([marketplaceState(ctx), getChecklist(ctx, {}), getActivity(ctx, { limit: 5 })]);
  const waiting = state.actions.filter(a => a.status === 'pending_review').length;
  const unanswered = state.conversations.filter(c => {
    const messages = state.messages.filter(m => m.conversation_id === c.id).sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return messages[0]?.direction === 'inbound';
  }).length;
  const next_steps = tasks.filter(t => t.status === 'todo').slice(0, 5).map(t => `${t.due_date ?? 'Undated'}: ${JSON.stringify(t.title)} — ${appLinks().plan}`);
  if (waiting) next_steps.push(`${waiting} actions awaiting exact-payload review — ${appLinks().muse}`);
  if (unanswered) next_steps.push(`${unanswered} buyer conversations awaiting a reply — ${appLinks().muse}`);
  return { ...state, links: appLinks(), next_steps, progress: { days_remaining: state.move.move_out_date ? Math.ceil((Date.parse(state.move.move_out_date) - Date.now()) / 86400000) : null, checklist: { todo: tasks.filter(t => t.status === 'todo').length, done: tasks.filter(t => t.status === 'done').length, skipped: tasks.filter(t => t.status === 'skipped').length }, approvals_waiting: waiting, unanswered_buyers: unanswered }, latest_activity: activity };
}

// Resource reads must never initialize a move or mutate state.
export async function readProgress(ctx: ToolContext) {
  const [move, actions, tasks, activity] = await Promise.all([
    ctx.db.from('moves').select('move_out_date').order('created_at').limit(1).maybeSingle(),
    ctx.db.from('actions').select('id').eq('status', 'pending_review'),
    getChecklist(ctx, {}), getActivity(ctx, { limit: 30 }),
  ]);
  if (move.error) throw new Error(move.error.message);
  if (actions.error) throw new Error(actions.error.message);
  return {
    links: appLinks(), latest_activity: activity.filter(a => a.actor === 'muse').slice(0, 5),
    progress: {
      days_remaining: move.data?.move_out_date ? Math.ceil((Date.parse(move.data.move_out_date) - Date.now()) / 86400000) : null,
      checklist: { todo: tasks.filter(t => t.status === 'todo').length, done: tasks.filter(t => t.status === 'done').length, skipped: tasks.filter(t => t.status === 'skipped').length },
      approvals_waiting: actions.data?.length ?? 0,
    },
  };
}
