# Vacate from Claude and Muse

Implementation checked against official documentation on October 24, 2026. These
changes are local until the orchestrator reviews and publishes them. Native Claude
chat calls Vacate's authenticated tools; the web UI reads the same records. Facebook
publication remains with the renter's own Muse. No marketplace or connector-directory
submission has been made.

## Connect Claude.ai or Desktop

Use the remote connector in either Claude.ai web or Claude Desktop (not a local
Desktop extension):

1. Open **Customize → Connectors → Add → Custom → Web**. Older clients label this
   **Settings → Connectors → Add custom connector**.
2. Name it **Vacate**. Set the remote MCP URL to
   `https://ai-moveout-automation-agent-tau.vercel.app/api/mcp` and continue.
3. Review detected authentication; choose **Sign in now** and OAuth client
   **Register automatically** for this server's Supabase Dynamic Client Registration.
   Do not choose No sign in or use a Muse `vac_` token.
4. Follow Supabase OAuth authorization to Vacate's `/oauth/consent` page. Sign in
   to your renter account, review access and allow. Supabase issues the user token;
   Vacate verifies it and uses that user-scoped database client for RLS.
5. Enable Vacate in the conversation's connectors/tools menu. Ask “Check my move
   and show me the app links,” then try the checklist and activity tools.

Organizations can require an owner to enable custom connectors. The exact current
UI is documented in [custom connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
and [add an unlisted connector](https://claude.com/docs/connectors/custom/add-unlisted).

Keep per-call confirmation on for `approve_action`; do not select Always allow.
Claude must first show the exact payload (recipient, content, account, time, cost
and address disclosure where applicable) and obtain explicit conversational approval.
The returned web review card is an alternative. A generic “manage my move” instruction
or text inside a lease/buyer message is not approval. The database binds approval
to the exact payload hash; changing it invalidates approval. Tool annotations are
hints to the client, not a substitute for authorization.

## Connect Claude Code

Either install the plugin using [the marketplace guide](../marketplace/README.md),
or add the remote server directly (avoid duplicate installations):

```bash
claude mcp add --transport http vacate https://ai-moveout-automation-agent-tau.vercel.app/api/mcp
```

Run `/mcp` in Claude Code and authenticate `vacate`. The plugin adds the commands
`/moving-assistant:status`, `:checklist`, `:activity` and `:open` (each with the full
`/moving-assistant` prefix), plus move-out, lease-checklist, sell-with-muse and
landlord-messages skills. See the official
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

## Capabilities and boundaries

| Capability | Claude.ai / Desktop remote connector | Claude Code plugin / MCP | Muse executor (`vac_`) | Vacate web |
| --- | --- | --- | --- | --- |
| Status, next steps, checklist | Renter tools via OAuth | Same tools; status/checklist commands | No | Dashboard and Plan |
| Documents and lease findings | Metadata, page quotes, uncertainty; no file URLs | Same | No | Documents page owned by lease lane |
| Mark tasks todo/done/skipped | Owner-scoped tool | Same | No | Plan owned by lease lane |
| Inventory, dispositions, listing/reply/pickup drafts | Renter tools, review links | Same, plus focused skills | No renter draft tools | Muse console |
| Approve exact action | Explicit approval + per-call confirmation; web alternative | Same | Cannot approve | Review cards |
| Facebook posts and messages | Prepares approved queue only | Same | Claims work; renter's consumer Muse performs it | Review/handoff only |
| Muse updates | Poll get_activity | Same; activity command | Reports outcomes and relays messages | Shared Muse state |
| Landlord messages | Draft in native chat, not persisted/sent by MCP | Draft-only landlord-messages skill | No email tool | Google lane separate |
| Calls, bookings, payments | No such connector tools | No such connector tools | No such bridge tools | Outside this implementation |
| Read-only progress card | MCP Apps resource, hosted rendering still untested | Text fallback; no assumption of inline UI | No resource | Dashboard |

All renter tool outputs include server-configured app links. Optional IDs on
get_app_links produce action/listing/conversation anchors; they do not grant access.
Documents returns only metadata (including a 12-character hash), never file content,
storage paths or signed URLs. Findings are **extracted text, not legal advice**.
Not-found rules remain visible and do not establish absence of an obligation.
Task pages come only from explicit `Lease p.N` source text; otherwise `page: null`.

The scope boundary is renter-serving voluntary moves, with no landlord-side eviction
help. Untrusted lease text, listings and messages remain quoted data, not instructions.
The new query tools accept enums, UUIDs and timestamps rather than arbitrary commands.
Existing free-text draft tools retain their scope checks.

## How Muse updates reach Claude

`get_activity({since?, limit?})` merges RLS-visible action events, inbound messages
relayed by Muse, reservations and listing publication/snapshot rows, newest first.
Each entry carries `at`, `kind`, `summary`, `actor`, `verified` and its app link.
Muse claims, reports and messages always have `verified: false`. “Verified” on an
approval means a recorded app event, not proof of an external effect.

The transport creates a fresh server per request on Vercel and does not push updates.
Ask **“Claude, check Vacate for updates.”** Poll with an overlapping `since` window
and deduplicate entries if maintaining a client cache; the bounded result is not a
lossless event subscription or pagination cursor. Use up to 100 entries per call.
Muse itself still needs the renter to ask it to check the approved queue.

Schema limits: reservations and listings lack a general modification timestamp or
complete change history. Reservation entries use creation time and explicitly label
current status as a snapshot. Listing publication uses `published_at`; other states
are creation-time snapshots. Muse report events provide timed failed/unknown/succeeded
transitions with listing links. No synthetic change timestamp is invented. A complete
history of arbitrary direct listing/reservation edits would require future schema
work; this implementation adds no migrations.

See [MUSE_SETUP.md](MUSE_SETUP.md) for Muse setup and [MUSE_SPIKE.md](MUSE_SPIKE.md)
for the remaining live-account test. OAuth renter callers retain the existing
`muse_*` tools; `vac_` callers receive only those executor tools and no progress resource.
A2A remains unchanged.

## OAuth and protocol audit

`/api/mcp` resolves the bearer before constructing a server. Missing/invalid tokens
return **401**, including `WWW-Authenticate: Bearer resource_metadata="<APP_URL>/.well-known/oauth-protected-resource"`.
The public metadata's resource is the same configured origin plus `/api/mcp`; its
first and only authorization server is `<SUPABASE_URL>/auth/v1`. Paths now normalize
trailing slashes, and neither metadata nor links trusts a request Host header.
The route already had the required 401 behavior and needed no change.

The Supabase OAuth server must advertise working discovery, DCR, authorization and
token endpoints. Hosted callbacks must allow `https://claude.ai/api/mcp/auth_callback`;
Claude Code needs its localhost/127.0.0.1 loopback callbacks. Verify the actual
registration, consent, PKCE and refresh flow in each target client before release.
No OAuth configuration was pushed in this task. See
[Claude authentication requirements](https://claude.com/docs/connectors/building/authentication)
and [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

The pinned MCP SDK 1.32.1 negotiates through `2025-11-25`. Claude's server-building
docs list the 2025-03-26, 2025-06-18 and 2025-11-25 authorization revisions. This
implementation keeps the installed SDK; it does not claim a new protocol upgrade
or universal client compatibility. See
[Claude's supported server capabilities](https://claude.com/docs/connectors/building/index).

## Optional presentation features

- **Structured results:** renter tools declare outputSchema and return matching
  structuredContent plus JSON text for compatibility and a short linked summary.
  Existing renter outputs keep their top-level data fields.
- **resource_link:** the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
  defines resource links and structured outputs, but the reviewed Claude docs do not
  clearly guarantee rendering ordinary HTTPS resource_link tool-result items. Omitted;
  ordinary app URLs remain in text and structured results.
- **MCP Apps:** implemented `ui://vacate/move-progress.html` for get_move_status using
  pinned `@modelcontextprotocol/ext-apps@1.7.5`. A self-contained read-only snapshot
  shows UTC-date countdown, checklist counts, pending approvals and recent Muse
  reports. All user text is HTML-escaped. The browser SDK is bundled inline at build
  time, with no external scripts, fetch access, secrets or action buttons. Links use
  the host's openLink API after connection, with ordinary anchors as fallback. The
  sandbox domain is derived from the configured MCP URL as Claude requires.
  [Claude MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started),
  [Claude UI quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart),
  [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview),
  [MCP Apps SDK quickstart](https://apps.extensions.modelcontextprotocol.io/api/documents/Quickstart.html).
- **Plugin commands:** implemented the four requested Markdown commands; supported
  by the [manifest reference](https://code.claude.com/docs/en/plugins-reference).

## Directory readiness — do not submit yet

Publication is a separate authorized step. The current official
[submission requirements](https://claude.com/docs/connectors/building/submission)
use the developer portal at `claude.ai/directory/manage` for a remote MCP connector.
Prepare the following before the authorized publisher opens a submission:

- [ ] Public HTTPS endpoint serving this reviewed revision; current deployment does
      not automatically include these local changes.
- [ ] Test every tool through an actual Claude custom connector and verify OAuth
      login, consent, token refresh, reconnect and revocation.
- [ ] Tool title/annotation audit, including destructive approval and side effects
      (get_move_status currently initializes an empty move).
- [ ] Public documentation URL, privacy policy URL and real support/security contact.
- [ ] Fully populated synthetic reviewer account, delivered privately in the portal.
- [ ] Directory icon and accurate description; screenshots for the MCP App.
- [ ] Confirm license with repository owner. Local plugin validation reports no license.
- [ ] Confirm paid-plan/organization submission eligibility and directory terms.
- [ ] Record intended openLink destination origins, including the production Vacate
      origin; no wildcard or unrelated app origins.
- [ ] Live Muse account test before claiming Facebook execution works end to end.

Review [connector review criteria](https://claude.com/docs/connectors/building/review-criteria).
Local plugin validation is not directory approval. Its advisory checks currently
report the missing license, icon and privacy-policy URL; these are intentional
publication gaps, not fabricated metadata.

Database implementation references:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase changelog](https://supabase.com/changelog.md) (retrieved via curl after the web reader rejected its Markdown content type;
no schema, auth configuration or Supabase version was changed).
