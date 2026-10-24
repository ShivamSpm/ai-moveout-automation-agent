# Muse setup: developer libraries, keys and the Facebook-posting account

Checked against Meta's docs on October 24, 2026. Two different Muse products are
involved; you need both for the full flow.

| Product | What it is | What we use it for |
| --- | --- | --- |
| **Muse Code** + `@muse-code/sdk` | Meta's coding-agent host (`muse serve`) and its TypeScript SDK (MSP protocol) | Developer harness: drive Muse sessions from our code, test our connector with Muse models |
| **Muse** (consumer agent) | The personal assistant tied to your Meta account; Facebook connects through Accounts Center; opt-in Marketplace integration | The only thing that can post **as your Facebook profile** and message buyers |

The SDK does **not** grant Facebook access. Posting as you happens in consumer Muse,
signed in as you, under Muse's own approval prompts. Our app hands Muse the exact
listing you approved and records what Muse reports.

## 1. Meta developer account, billing and API key (Muse Code, SDK, Model API)

1. Sign in to the Meta Model API dashboard (the **Platform** link from
   <https://dev.meta.ai/docs/authentication>). If you sign up through
   **Business & Enterprise** (an "MMA" account) you must use an API key; browser
   sign-in does not work for MMA accounts.
2. A team admin adds a payment method on the **Billing** page. Billing is usage-based
   per token; a flat monthly option is described at `/docs/muse-code/subscriptions`.
   Check usage on the **Usage** page.
3. Create a key: dashboard → **API keys** → **Create API key** → name it → **Create**.
   Copy it immediately; it is shown once. Keys begin with `LLM_`.
4. Put it in your local env file only (git-ignored), never in the repository:

   ```bash
   # web/.env.local
   META_API_KEY=LLM_...        # read by the muse CLI / muse serve
   MODEL_API_KEY=LLM_...       # same key, for direct Model API calls (https://api.meta.ai/v1)
   ```

5. Install the Muse Code host (checksum-verified launcher in `~/.local/bin`):

   ```bash
   curl https://dev.meta.ai/install.sh | bash
   muse            # first run: choose browser sign-in or paste the API key
   # or non-interactively: muse auth set   /   export META_API_KEY=...
   ```

   Precedence: `META_API_KEY` > stored key > browser session. `muse logout` does not
   unset `META_API_KEY`.

6. Verify the SDK pairing (from the repo root, after step 5):

   ```bash
   cd web && npm run muse:check
   ```

   This spawns `muse serve`, completes the MSP handshake, starts a session and runs
   one turn. Exit code 5 from the host means that build's experimental SDK tier is
   disabled; `authRequired` means no usable credential.

Run `! muse` inside Claude Code if you want the sign-in output in this session.

## 2. Let Muse Code call this app (developer harness)

Muse Code reads MCP servers from the `mcp_servers` block of its settings file
(key is `mcp_servers`, not `mcpServers`). Remote servers use `streamable_http`:

```json
{
  "mcp_servers": {
    "vacate": {
      "transport": "streamable_http",
      "url": "https://<public-app-host>/api/mcp",
      "headers": { "Authorization": "Bearer ${VACATE_CONNECTOR_TOKEN}" },
      "mode": "optional"
    }
  }
}
```

Or omit `headers` and run `muse mcp login vacate` to sign in through the app's OAuth
flow. Meta notes MCP tools are not sandboxed; only connect servers you trust.

## 3. The Facebook-posting account (consumer Muse)

1. Use the Muse app signed in with the Meta account whose Facebook profile should
   post. Facebook, Instagram and Threads connect automatically when they share an
   Accounts Center with that Meta account.
2. Turn on Muse's Marketplace integration (opt-in). Keep approvals on: Meta's
   connector rules make sensitive writes ask every time.
3. In the Vacate web app, open **/muse**, create a connector token, and copy the
   public URLs it shows (Agent Card and MCP endpoint).
4. In Muse, ask it to create a **Custom Connector** for Vacate using that URL and
   token (Muse: Settings → Connectors, or ask "Create a custom connector for …").
   Meta documents custom connectors as Muse "retrieving API information from the
   service"; it does not document whether that accepts MCP, A2A or an API key.
   **This is the live capability test** — record what Muse accepts in
   `docs/MUSE_SPIKE.md`.
5. Approve a listing in Vacate, then tell Muse: "Check Vacate for approved
   Marketplace work and post it." Muse should call `muse_list_tasks`,
   `muse_claim_task`, post the listing with its own approval prompt, and call
   `muse_report_result` with the `facebook.com/marketplace/item/…` URL.

Publicly listed connectors go through Meta's connector review
(<https://platform.muse.ai/docs>: risk assessment, tool review, end-to-end QA, test
account). A custom connector for your own account is the hackathon path.

## 4. Public URL

Muse (and Claude.ai) run in the cloud and need an HTTPS URL. Options:

- The hosted app: https://ai-moveout-automation-agent-tau.vercel.app (MCP at
  `/api/mcp`, Agent Card at `/.well-known/agent-card.json`), backed by Supabase
  project `sejfkcrmcbsiidftraek`. Preview deployment URLs sit behind Vercel login,
  so Muse and Claude.ai can only reach the production domain.
- A tunnel to local development (`ngrok http 3000`). Exposing a dev server is an
  outward-facing step; start it deliberately and stop it after the test. For OAuth
  against a local Supabase you must also tunnel Supabase and set `[auth] jwt_issuer`.

## Keys and where they go

| Name | Where | Purpose |
| --- | --- | --- |
| `META_API_KEY` | `web/.env.local`, CI secret | Muse Code host / SDK sessions |
| `MODEL_API_KEY` | `web/.env.local`, Vercel env if used | Direct Muse model calls |
| Connector token `vac_…` | Shown once on /muse; paste into Muse | Muse executor access to approved work only |
| Supabase keys | Vercel env (from Vincent) | App database and OAuth server |

Do not commit any of these. Revoke a connector token on /muse if it leaks.
