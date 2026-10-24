import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { appLink } from '../links';
import type { readProgress } from './renter';
export const PROGRESS_URI = 'ui://vacate/move-progress.html';
export const PROGRESS_MIME = 'text/html;profile=mcp-app';
export function progressMeta() {
  return { ui: { domain: `${createHash('sha256').update(appLink('/api/mcp')).digest('hex').slice(0, 32)}.claudemcpcontent.com`, csp: { connectDomains: [], resourceDomains: [] } } };
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export async function progressHtml(state: Awaited<ReturnType<typeof readProgress>>) {
  const p = state.progress;
  const script = await readFile(path.join(process.cwd(), 'generated/progress-client.js'), 'utf8');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacate progress</title><style>body{font:16px system-ui;padding:20px;margin:0;color:#19352e;background:#f8f5ed}section{border:1px solid #afbbb0;border-radius:16px;padding:20px;max-width:600px}h1{margin-top:0}a{color:#1c624f}li{margin:10px 0}</style><section><h1>Your move</h1><p>${p.days_remaining === null ? 'Move date not set' : `${p.days_remaining} days until move-out (UTC date estimate)`}</p><p>Checklist: ${p.checklist.done} done · ${p.checklist.todo} to do · ${p.checklist.skipped} skipped</p><p>${p.approvals_waiting} approvals waiting</p><h2>Latest Muse activity</h2><ul>${state.latest_activity.filter(a => a.actor === 'muse').map(a => `<li>${escape(a.summary)} — reported, unverified</li>`).join('') || '<li>No recent Muse reports.</li>'}</ul><p>Snapshot at ${escape(new Date().toISOString())}. Ask Claude to check for updates.</p><a href="${escape(state.links.dashboard)}" target="_blank" rel="noopener noreferrer">Open in Vacate</a> · <a href="${escape(state.links.plan)}" target="_blank" rel="noopener noreferrer">Checklist</a> · <a href="${escape(state.links.muse)}" target="_blank" rel="noopener noreferrer">Review approvals</a></section><script>${script.replace(/<\/script/gi, "<\\/script")}</script></html>`;
}
