// End-to-end check of the connector sign-in path an MCP client (Claude, Muse)
// takes: discovery -> dynamic client registration -> PKCE authorize -> renter
// consent -> token -> MCP tools/list. Local stack only; uses a synthetic user.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const app = process.env.APP_URL;
const out = {};

const prm = await fetch(`${app}/.well-known/oauth-protected-resource`).then((r) => r.json());
const issuer = prm.authorization_servers[0];
const meta = await fetch(`${issuer}/.well-known/openid-configuration`).then((r) => r.json());
out.discovery = { issuer, registration: meta.registration_endpoint };

const redirectUri = "http://localhost:53682/callback";
const reg = await fetch(meta.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "oauth-mcp-check", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
out.registration = { status: reg.status, client_id: reg.body.client_id };
if (!reg.body.client_id) throw new Error(JSON.stringify(reg.body));

const email = `oauth-check-${randomBytes(4).toString("hex")}@example.test`;
const password = `pw-${randomBytes(12).toString("hex")}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const signIn = await user.auth.signInWithPassword({ email, password });
if (signIn.error) throw signIn.error;

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authorize = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({ response_type: "code", client_id: reg.body.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: prm.resource })) authorize.searchParams.set(k, v);
const authRes = await fetch(authorize, { redirect: "manual" });
const consentUrl = new URL(authRes.headers.get("location"), app);
out.authorizeRedirect = `${consentUrl.origin}${consentUrl.pathname}`;
const authorizationId = consentUrl.searchParams.get("authorization_id");

const details = await user.auth.oauth.getAuthorizationDetails(authorizationId);
out.consentShows = { client: details.data?.client?.name, scope: details.data?.scope };
const approved = await user.auth.oauth.approveAuthorization(authorizationId);
const code = new URL(approved.data.redirect_url).searchParams.get("code");

const token = await fetch(meta.token_endpoint, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: reg.body.client_id, code_verifier: verifier }),
}).then((r) => r.json());
out.token = { type: token.token_type, has_access: !!token.access_token, has_refresh: !!token.refresh_token };

const mcp = (body) => fetch(`${app}/api/mcp`, {
  method: "POST",
  headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify(body),
}).then((r) => r.json());
const init = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "oauth-mcp-check", version: "0" } } });
out.mcpProtocol = init.result?.protocolVersion;
const tools = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
out.tools = tools.result?.tools?.map((t) => t.name);
const status = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_move_status", arguments: {} } });
out.moveOwnedBySignedInRenter = JSON.parse(status.result.content[0].text).move.owner_id === signIn.data.user.id;
console.log(JSON.stringify(out, null, 2));
