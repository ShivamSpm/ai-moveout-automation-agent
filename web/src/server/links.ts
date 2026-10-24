import "server-only";
import { env } from "./env";

// The configured server origin is the only authority for app links.
export function appLink(path: string) {
  const base = new URL(env.appUrl());
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('APP_URL must use HTTP(S)');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected an app path');
  return new URL(path, base.origin).href;
}
export const actionLink = (id: string) => appLink(`/muse#action-${encodeURIComponent(id)}`);
export const listingLink = (id: string) => appLink(`/muse#listing-${encodeURIComponent(id)}`);
export const conversationLink = (id: string) => appLink(`/muse#conversation-${encodeURIComponent(id)}`);
export function appLinks(ids: { actionId?: string; listingId?: string; conversationId?: string } = {}) {
  return {
    dashboard: appLink('/dashboard'), plan: appLink('/plan'), documents: appLink('/account/documents'),
    account: appLink('/account'), muse: appLink('/muse'),
    ...(ids.actionId ? { action: actionLink(ids.actionId) } : {}),
    ...(ids.listingId ? { listing: listingLink(ids.listingId) } : {}),
    ...(ids.conversationId ? { conversation: conversationLink(ids.conversationId) } : {}),
  };
}
