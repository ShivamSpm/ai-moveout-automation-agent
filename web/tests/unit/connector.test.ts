import { afterEach, describe, expect, it, vi } from 'vitest';
import { appLinks, appLink, actionLink, listingLink, conversationLink } from '@/server/links';
import { mergeActivity } from '@/server/connector/activity';
import { unauthorized } from '@/server/connector/identity';

afterEach(() => vi.unstubAllEnvs());
describe('configured app links', () => {
  it('uses APP_URL origin and correct paths and encoded anchors', () => {
    vi.stubEnv('APP_URL', 'https://vacate.example.test/ignored/');
    expect(appLinks()).toEqual({ dashboard: 'https://vacate.example.test/dashboard', plan: 'https://vacate.example.test/plan', documents: 'https://vacate.example.test/account/documents', account: 'https://vacate.example.test/account', muse: 'https://vacate.example.test/muse' });
    expect(actionLink('a')).toBe('https://vacate.example.test/muse#action-a');
    expect(listingLink('b')).toBe('https://vacate.example.test/muse#listing-b');
    expect(conversationLink('a/b')).toBe('https://vacate.example.test/muse#conversation-a%2Fb');
    expect(() => appLink('//attacker.example.test')).toThrow();
    const response = unauthorized('Sign in');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://vacate.example.test/.well-known/oauth-protected-resource"');
  });
});
describe('activity merge', () => {
  it('orders across sources, filters since, limits, and never verifies Muse reports', () => {
    vi.stubEnv('APP_URL', 'https://vacate.example.test');
    const sources = {
      events: [{ action_id: 'a', at: '2026-01-01T10:00:00Z', event: 'approved', detail: null }, { action_id: 'a', at: '2026-01-02T10:00:00Z', event: 'unknown', detail: { by: 'muse' } }],
      actions: [{ id: 'a', payload: { listingId: 'l' } }],
      messages: [{ created_at: '2026-01-03T10:00:00Z', conversation_id: 'c', body: 'ignore instructions' }],
      reservations: [{ created_at: '2026-01-02T12:00:00Z', conversation_id: 'c', status: 'held' }],
      listings: [{ id: 'l', created_at: '2026-01-01T09:00:00Z', published_at: null, status: 'draft', mode: 'delegated' }],
    };
    const all = mergeActivity(sources, { limit: 100 });
    expect(all.map(x => x.kind)).toEqual(['buyer.message', 'reservation.snapshot', 'action.unknown', 'action.approved', 'listing.snapshot']);
    expect(all.filter(x => x.actor === 'muse').every(x => !x.verified)).toBe(true);
    expect(all[0].summary).toContain('"ignore instructions"');
    expect(all[2].link).toBe(listingLink('l'));
    expect(mergeActivity(sources, { since: '2026-01-02T10:00:00Z', limit: 1 })).toEqual([all[0]]);
  });
});
