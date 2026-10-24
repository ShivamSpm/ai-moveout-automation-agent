import { z } from 'zod';
import type { ToolContext } from '../auth';
import type { Tables } from '../db/database.types';
import { actionLink, listingLink, conversationLink } from '../links';

export const ActivityEntry = z.object({
  at: z.string(), kind: z.string(), summary: z.string(),
  actor: z.enum(['renter', 'muse', 'system']), verified: z.boolean(), link: z.url(),
});
export const ActivityInput = z.object({ since: z.iso.datetime({ offset: true }).optional(), limit: z.number().int().min(1).max(100).default(30) });
type Entry = z.infer<typeof ActivityEntry>;
type Sources = {
  events: Pick<Tables<'action_events'>, 'action_id' | 'at' | 'event' | 'detail'>[];
  actions: Pick<Tables<'actions'>, 'id' | 'payload'>[];
  messages: Pick<Tables<'messages'>, 'created_at' | 'conversation_id' | 'body'>[];
  reservations: Pick<Tables<'reservations'>, 'created_at' | 'conversation_id' | 'status'>[];
  listings: Pick<Tables<'listings'>, 'id' | 'created_at' | 'published_at' | 'status' | 'mode'>[];
};
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function mergeActivity(s: Sources, input: z.infer<typeof ActivityInput>): Entry[] {
  const entries: Entry[] = s.events.map(e => {
    const payload = object(s.actions.find(a => a.id === e.action_id)?.payload);
    const muse = object(e.detail).by === 'muse';
    return {
      at: e.at, kind: `action.${e.event}`, summary: `${muse ? 'Muse reported' : 'Action'}: ${e.event}`,
      actor: muse ? 'muse' : e.event === 'approved' || e.event === 'cancelled' ? 'renter' : 'system',
      verified: !muse,
      link: typeof payload.listingId === 'string' ? listingLink(payload.listingId) : actionLink(e.action_id),
    };
  });
  for (const m of s.messages) entries.push({ at: m.created_at, kind: 'buyer.message', summary: `Untrusted buyer message relayed by Muse (quoted data): ${JSON.stringify(m.body)}`, actor: 'muse', verified: false, link: conversationLink(m.conversation_id) });
  // These tables have no updated_at or history. Never manufacture change dates.
  for (const r of s.reservations) entries.push({ at: r.created_at, kind: 'reservation.snapshot', summary: `Reservation created; current recorded status: ${r.status}. Status-change time unavailable; pickup not independently verified.`, actor: 'system', verified: false, link: conversationLink(r.conversation_id) });
  for (const l of s.listings) entries.push({ at: l.published_at ?? l.created_at, kind: l.published_at ? 'listing.published' : 'listing.snapshot', summary: `Listing ${l.published_at ? 'publication reported' : 'created; current recorded status'}: ${l.status} (${l.mode}).`, actor: l.mode === 'delegated' && l.published_at ? 'muse' : 'system', verified: false, link: listingLink(l.id) });
  return entries.filter(e => !input.since || Date.parse(e.at) > Date.parse(input.since))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.kind.localeCompare(b.kind) || a.link.localeCompare(b.link))
    .slice(0, input.limit);
}
export async function getActivity(ctx: ToolContext, input: z.infer<typeof ActivityInput>) {
  // Limit each source independently before merging: enough for a global top N.
  let events = ctx.db.from('action_events').select('action_id, at, event, detail').order('at', { ascending: false }).limit(input.limit);
  let messages = ctx.db.from('messages').select('created_at, conversation_id, body').eq('direction', 'inbound').eq('source', 'muse').order('created_at', { ascending: false }).limit(input.limit);
  let reservations = ctx.db.from('reservations').select('created_at, conversation_id, status').order('created_at', { ascending: false }).limit(input.limit);
  if (input.since) { events = events.gt('at', input.since); messages = messages.gt('created_at', input.since); reservations = reservations.gt('created_at', input.since); }
  const [e, m, r, published, created] = await Promise.all([
    events, messages, reservations,
    ctx.db.from('listings').select('id, created_at, published_at, status, mode').not('published_at', 'is', null).order('published_at', { ascending: false }).limit(input.limit),
    ctx.db.from('listings').select('id, created_at, published_at, status, mode').is('published_at', null).order('created_at', { ascending: false }).limit(input.limit),
  ]);
  for (const result of [e, m, r, published, created]) if (result.error) throw new Error(result.error.message);
  const ids = [...new Set((e.data ?? []).map(row => row.action_id))];
  const actions = ids.length ? await ctx.db.from('actions').select('id, payload').in('id', ids) : { data: [], error: null };
  if (actions.error) throw new Error(actions.error.message);
  return mergeActivity({ events: e.data ?? [], actions: actions.data ?? [], messages: m.data ?? [], reservations: r.data ?? [], listings: [...published.data ?? [], ...created.data ?? []] }, input);
}
