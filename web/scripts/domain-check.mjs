#!/usr/bin/env node
// Public probes only: no credentials, writes, OAuth registration or bypass tokens.
import assert from 'node:assert/strict';
import { BlockList, isIP } from 'node:net';
import tls from 'node:tls';

const domain = (process.env.VACATE_DOMAIN || 'vacate.dev').trim().toLowerCase();
assert(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain), 'VACATE_DOMAIN must be a hostname, without scheme or path');
const appOnly = process.argv.includes("--app-only");
const origin = `https://${domain}`;
const issuer = 'https://sejfkcrmcbsiidftraek.supabase.co/auth/v1';
const rows = [];
const request = (url, options = {}) => fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(12000) });
async function json(url, options) {
  const response = await request(url, options);
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  return response.json();
}
async function doh(name, type) {
  const result = await json(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
  assert.equal(result.Status, 0, `${name} ${type}: DNS status ${result.Status}`);
  return result.Answer || [];
}
async function check(name, fn) {
  try { rows.push({ check: name, result: 'PASS', detail: await fn() || 'OK' }); }
  catch (error) { rows.push({ check: name, result: 'FAIL', detail: `${error.message}${error.cause ? ` (${error.cause.code || error.cause.message})` : ''}` }); }
}
const clean = (name) => name.toLowerCase().replace(/\.$/, '');
const cloudflare = new BlockList();
let rangesReady = false;
if (!appOnly) {
await check('Cloudflare edge IP ranges', async () => {
  for (const family of [4, 6]) {
    const response = await request(`https://www.cloudflare.com/ips-v${family}`);
    assert.equal(response.status, 200);
    const ranges = (await response.text()).trim().split(/\s+/);
    assert(ranges.length > 0);
    for (const cidr of ranges) {
      const [ip, prefix] = cidr.split('/');
      assert.equal(isIP(ip), family);
      cloudflare.addSubnet(ip, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
    }
  }
  rangesReady = true;
});
await check('Cloudflare nameservers', async () => {
  const ns = (await doh(domain, 'NS')).filter(r => r.type === 2).map(r => clean(r.data));
  assert(ns.length >= 2 && ns.every(n => n.endsWith('.ns.cloudflare.com')), `Observed NS: ${ns.join(', ') || 'none'}`);
  return ns.join(', ');
});
for (const host of [domain, `www.${domain}`]) {
  await check(`DNS-only Vercel: ${host}`, async () => {
    assert(rangesReady, 'Cannot exclude proxy IPs: Cloudflare ranges unavailable');
    const answers = (await Promise.all(['A', 'AAAA', 'CNAME'].map(t => doh(host, t)))).flat();
    const ips = [...new Set(answers.filter(r => [1, 28].includes(r.type)).map(r => r.data))];
    assert(ips.length, 'No A/AAAA addresses');
    assert(ips.every(ip => !cloudflare.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4')), `Cloudflare proxy IP: ${ips.join(', ')}`);
    // CNAMEs are project-specific; apex A records are flattened. Compare to
    // Vercel's public DNS target as well as its documented apex addresses.
    const reference = (await doh('cname.vercel-dns.com', 'A')).filter(r => r.type === 1).map(r => r.data);
    const vercelCname = answers.some(r => r.type === 5 && /(?:^|\.)vercel-dns(?:-\d+)?\.com$/.test(clean(r.data)));
    const known = new Set(['76.76.21.21', '216.198.79.1', ...reference]);
    assert(vercelCname || host.endsWith('.vercel.app') || ips.every(ip => known.has(ip)), `Unrecognized Vercel target: ${ips.join(', ')}; compare project Domains settings (targets can change)`);
    return ips.join(', ');
  });
}
await check('Cloudflare Email Routing MX', async () => {
  const mx = (await doh(domain, 'MX')).filter(r => r.type === 15).map(r => clean(r.data.split(/\s+/)[1]));
  assert([1, 2, 3].every(n => mx.includes(`route${n}.mx.cloudflare.net`)), `Observed MX: ${mx.join(', ') || 'none'}`);
  return mx.join(', ');
});
}
for (const host of appOnly ? [domain] : [domain, `www.${domain}`]) {
  await check(`TLS: ${host}`, () => new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true });
    const timer = setTimeout(() => socket.destroy(new Error('TLS timeout')), 12000);
    socket.once('secureConnect', () => { clearTimeout(timer); const certificate = socket.getPeerCertificate(); socket.end(); resolve(`valid through ${certificate.valid_to}`); });
    socket.once('error', error => { clearTimeout(timer); socket.destroy(); reject(error); });
  }));
}
if (!appOnly) await check('www → apex 308', async () => {
  const response = await request(`https://www.${domain}/`);
  assert.equal(response.status, 308, `HTTP ${response.status}`);
  assert.equal(new URL(response.headers.get('location'), `https://www.${domain}`).href, `${origin}/`);
});
for (const path of ['/', '/login']) {
  await check(`GET ${path}`, async () => {
    const response = await request(`${origin}${path}`);
    assert.equal(response.status, 200, `HTTP ${response.status}`);
    return `HTTP ${response.status}`;
  });
}
await check('Agent Card custom origin', async () => {
  const card = await json(`${origin}/.well-known/agent-card.json`);
  assert.equal(new URL(card.supportedInterfaces?.[0]?.url).origin, origin);
});
await check('OAuth resource metadata', async () => {
  const metadata = await json(`${origin}/.well-known/oauth-protected-resource`);
  assert.equal(metadata.resource, `${origin}/api/mcp`);
  assert(metadata.authorization_servers?.includes(issuer), 'Missing Supabase issuer');
});
await check('Unauthenticated MCP 401 + challenge', async () => {
  const response = await request(`${origin}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(response.status, 401, `HTTP ${response.status}`);
  const challenge = response.headers.get('www-authenticate') || '';
  assert(challenge.includes(`resource_metadata="${origin}/.well-known/oauth-protected-resource"`), `Unexpected challenge: ${challenge || 'missing'}`);
});
await check('Supabase OAuth discovery', async () => {
  const metadata = await json(`${issuer}/.well-known/openid-configuration`);
  assert.equal(metadata.issuer, issuer);
  assert(metadata.authorization_endpoint && metadata.token_endpoint, 'Missing OAuth endpoints');
});
console.log(`\nDomain check: ${origin} (${new Date().toISOString()})`);
for (const row of rows) console.log(`${row.result} | ${row.check} | ${String(row.detail).replaceAll("\n", " ")}`);
const failures = rows.filter(row => row.result === 'FAIL').length;
console.log(`${rows.length - failures}/${rows.length} passed; ${failures} failed.`);
process.exitCode = failures ? 1 : 0;
