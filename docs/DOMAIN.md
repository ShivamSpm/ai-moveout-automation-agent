# Vacate production domain runbook

Prepared October 24, 2026 on `feat/custom-domain`. This is a preparation runbook for Jorge and the release operator, not evidence that the domain or email is configured. Codex
made local config/script/test/docs edits and public read-only checks only. Every
hosted mutation below belongs to the orchestrator **after user confirmation**.

## Settings and preflight — orchestrator

Run shell examples from the repository root unless they explicitly enter `web/`.
Keep the domain name in one shell setting; derive other names from it:

```bash
export VACATE_DOMAIN="${VACATE_DOMAIN:-vacate.dev}"
export VACATE_ORIGIN="https://${VACATE_DOMAIN}"
export VACATE_TEAM=ai-moveout-automation-agent
export VACATE_PROJECT=ai-moveout-automation-agent
```

The TOML config necessarily contains literal URLs; if the selected domain changes,
update its two custom redirect entries and site URL before any push. The script
reads `VACATE_DOMAIN`, defaulting to the selected name. No domain is hard-coded in
application code. Project root is `web/`, production branch `main`. Preserve the
existing `https://ai-moveout-automation-agent-tau.vercel.app` alias throughout.
Supabase project: `sejfkcrmcbsiidftraek`; issuer remains
`https://sejfkcrmcbsiidftraek.supabase.co/auth/v1`. No paid Supabase auth domain.

Before changing anything, record the existing Supabase URL settings, Vercel domain
assignments/Production environment, registrar nameservers and Cloudflare DNS in a
private operational note. Do not copy credentials or personal addresses into git.

## 1. Purchase — Jorge only

**User:** approve the exact registration and billing account. Read-only pricing
via Vercel's public registrar API on October 24 returned **$13 purchase / $13 renewal / one year**. The public registrar API reported available (not premium); checkout price and
availability can change. Public DNS returned NXDOMAIN. No purchase was attempted.

**Jorge buys the domain himself.** The agent must not submit a purchase. Jorge
can use his own terminal or Vercel → team `ai-moveout-automation-agent` → Domains → Buy.
Recheck price and availability immediately before checkout:

```bash
vercel domains price "$VACATE_DOMAIN" --scope "$VACATE_TEAM"
# Jorge runs this interactively, never the agent:
vercel domains buy "$VACATE_DOMAIN" --scope "$VACATE_TEAM"
```

Confirm the selected team's billing/payment method, invoice
recipient, registrant contact and term. Complete registrant verification email.
Check Domains → selected domain → Auto Renewal is **on**; Vercel normally enables
it by default. Registration is billed through Vercel, separately from any
Cloudflare Workers subscription. Sources: [domain CLI](https://vercel.com/docs/cli/domains),
[renewals](https://vercel.com/docs/domains/working-with-domains/renew-a-domain).

## 2. Assign, delegate DNS, and wait for HTTPS — orchestrator

In the Vercel team → project → Settings → Domains, add the apex and connect it to
**Production**. Add `www` and select **Redirect to apex**, **308 Permanent Redirect**.
CLI can add the names; configure the redirect in that dashboard:

```bash
vercel domains add "$VACATE_DOMAIN" "$VACATE_PROJECT" --scope "$VACATE_TEAM"
vercel domains add "www.$VACATE_DOMAIN" "$VACATE_PROJECT" --scope "$VACATE_TEAM"
vercel domains inspect "$VACATE_DOMAIN" --scope "$VACATE_TEAM"
vercel domains inspect "www.$VACATE_DOMAIN" --scope "$VACATE_TEAM"
```

In the user's existing Cloudflare account **CTFBio, LLC**, onboard this domain as
its own DNS zone. Do not reuse another project's credentials or DNS records.
Copy the **two assigned Cloudflare nameservers**. In Vercel team → Domains →
selected domain → Nameservers → Edit, enter that pair. This delegates DNS while
Vercel remains registrar. Preserve all needed records during delegation.
[Nameserver editing](https://vercel.com/docs/domains/managing-nameservers).

Set these Cloudflare DNS records (TTL Auto):

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| A | `@` | Exact recommended apex IPv4 from this project's Domains screen/inspect output | DNS only |
| CNAME | `www` | Exact project-specific `…vercel-dns-….com` target shown by Vercel | DNS only |
| TXT, only if requested | `_vercel` | Exact ownership verification token shown for this domain | Not applicable |

**Unresolved values:** the domain has not been assigned, so this session cannot
truthfully supply its project-specific A/CNAME, nameserver pair or verification
token. Capture them after assignment; do not copy an example CNAME or assume a
universal apex IP. Remove conflicting web A/AAAA records only after comparing them
with Vercel's instructions. Vercel's current docs explicitly require the values
shown for the project. [External DNS setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain),
[domain redirect](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting).

Keep both web records grey-clouded. A proxy can intercept/block ACME validation;
a second cache does not follow Vercel invalidation and can serve old HTML with
new/missing assets. Current Vercel guidance does permit specially configured
proxies, but recommends direct routing; proxying does not inevitably break every
certificate. This setup deliberately uses DNS only.
[Vercel's Cloudflare guidance](https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment).

Wait for Valid Configuration and an issued certificate on **both** names in
Vercel Domains. Vercel issues/renews certificates automatically after successful
validation. Do not disable TLS verification in checks. `.dev` is HSTS-preloaded,
so browsers require HTTPS from the first visit; HTTP is not a staging workaround.
[Automatic TLS](https://vercel.com/docs/domains/working-with-ssl),
[Google Registry .dev](https://www.registry.google/domains/dev/).

```bash
curl --fail --silent --show-error -I "$VACATE_ORIGIN/"
curl --silent --show-error -I "https://www.$VACATE_DOMAIN/"
# Expected: apex 200; www 308 with Location: https://<apex>/
```

Deployment protection remains “all except custom domains”; verify these public
requests without a Vercel login/bypass token. Claude and Muse must reach metadata
and MCP anonymously before OAuth (MCP itself responds 401).

## 3. Switch hosted Supabase auth after HTTPS — orchestrator

Review the diff in `[remotes.production.auth]`. The intended settings are:

- Site URL: `https://vacate.dev`.
- Redirect URLs: the explicit `/auth/callback` URLs in
  `[remotes.production.auth]`, including the exact encoded `next` query for each
  normal app destination and `/start?resume=1`, on apex, www, the old production
  host and localhost:3100. **No wildcard redirect URLs.**
- Keep email confirmation, MFA, OAuth server and all other settings unchanged.

In Supabase → project `sejfkcrmcbsiidftraek` → Authentication → URL Configuration,
apply those exact values. Alternatively, after checking the CLI's proposed diff:

```bash
supabase config push --project-ref sejfkcrmcbsiidftraek
```

This command can synchronize more than auth: inspect `supabase config diff`
first and stop if it includes unrelated changes. No config push is authorized by
this preparation task. Use the URL Configuration dashboard if a narrowly scoped
change is needed. [CLI reference](https://supabase.com/docs/reference/cli/supabase-config-push).

The apex Site URL permits same-origin redirects. On secondary hosts, Supabase
matches the full redirect URL including query parameters. The checked-in exact
list covers normal page destinations but cannot enumerate dynamic invitation IDs
or OAuth consent queries. Before cutover, route those flows through the canonical
apex or have the auth owner store the validated return path in a same-site cookie
and use a fixed `/auth/callback` URL. Do not solve this with a wildcard. Verify
signup resume and Google/Microsoft return URLs on all supported hosts before
pushing config. Sources: [redirect rules](https://supabase.com/docs/guides/auth/redirect-urls),
[official redirect validation implementation](https://github.com/supabase/auth/blob/master/internal/utilities/request.go).

## 4. Update published references and OAuth branding — orchestrator

`env.appUrl()` already selects `VERCEL_PROJECT_PRODUCTION_URL` in Production.
Vercel supplies the **shortest production custom domain**, falling back to its
`vercel.app` hostname if none exists. Therefore the apex is selected automatically
when attached; `APP_URL` is not required if system environment variables are enabled.
Deploy/redeploy Production after domain assignment so the deployment has fresh
configuration, and check both metadata documents. Set **Production only** `APP_URL=https://vacate.dev` after HTTPS works to make
the canonical origin explicit, as Jorge requested. This overrides the automatic selection.
If automatic selection is unavailable or another shorter domain wins, explicitly
set that Production `APP_URL`. Do not set it for Preview; previews use the branch
alias. [System variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Update the private share env file's `VERCEL_PRODUCTION_URL=https://vacate.dev`
(with scheme); this is a team convenience setting, not Vercel's system variable.
Its location is not present in this worktree; orchestrator must locate it without
printing or committing secrets. Also update any existing `VACATE_MCP_URL` overrides.

The following is the complete original tracked old-URL inventory at handoff.
These files are deliberately left unchanged so public instructions do not claim
that an unregistered domain is live. Apply current-reference changes after HTTPS:

| Original path:line | New value / action |
| --- | --- |
| `README.md:38` | `https://vacate.dev/api/mcp` |
| `docs/MUSE_SETUP.md:106` | `https://vacate.dev` |
| `marketplace/README.md:17` | `https://vacate.dev/api/mcp` |
| `plugins/moving-assistant/.mcp.json:5` (connector owner) | `${VACATE_MCP_URL:-https://vacate.dev/api/mcp}` |
| `docs/CONNECTORS.md:17` (connector owner) | `https://vacate.dev/api/mcp` |
| `docs/CONNECTORS.md:45` (connector owner) | `claude mcp add --transport http vacate https://vacate.dev/api/mcp` |
| `docs/STATUS.md:78` (orchestrator) | Live URL becomes `https://vacate.dev`; retain old URL as fallback |
| `docs/STATUS.md:170` (orchestrator) | Historical URL: preserve, annotate “superseded by https://vacate.dev after cutover” |
| `supabase/config.toml:426` (this diff) | Proposed Site URL `https://vacate.dev`; apply after HTTPS |
| `supabase/config.toml:451` (this diff) | Preserve the exact old-host callback entries during cutover |

No matching old hostname was found in `docs/DEVELOPMENT.md`, start/signup files,
proxy, connector server files, migrations, storage docs or account files. Ask the
start-signup owner to add `[Custom domain cutover](DOMAIN.md)` at
`docs/DEVELOPMENT.md:93` under “Enable Google or Microsoft sign-in”;
no domain-code change is needed there. Orchestrator should repeat `rg -n` after
merging the parallel branches because line numbers and new references can change.

Google: Google Auth Platform → Clients → web client → add authorized JavaScript
origins `https://vacate.dev` and `https://www.vacate.dev` if that client uses browser
sign-in; Branding → Authorized domains → `vacate.dev`, update homepage/privacy/
terms URLs and support contact to the real published pages and `support@vacate.dev`.
Keep the existing Supabase redirect URI
`https://sejfkcrmcbsiidftraek.supabase.co/auth/v1/callback` unchanged.
[Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Google OAuth origin/redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server).

Microsoft: Entra ID → App registrations → selected app → Branding & properties:
update homepage/privacy/terms and verify `vacate.dev` as publisher domain if used.
Authentication → Web redirect remains the same Supabase callback above. Microsoft
does **not** have Google's “authorized JavaScript origins” field: update any
actually configured SPA redirect/logout URLs to their exact new equivalents, but
do not invent SPA callbacks for this server-side Supabase flow.
[Azure provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure).
Reauthenticate Claude/Muse against the new MCP URL and test real browser sign-in
and consent after the user authorizes these account changes.

## 5. Support inbox to the whole team — user, then orchestrator

**User:** provide private destination addresses for Jorge, Vincent, Steven and
Shivam; each person must click Cloudflare's verification email.
**Orchestrator:** in CTFBio, LLC → Compute → Email Service → Email Routing, onboard
the domain, add all four Destination Addresses and wait until each is verified.
[Routing setup](https://developers.cloudflare.com/email-service/get-started/route-emails/),
[destination verification and rules](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).

Cloudflare DNS (TTL Auto; MX priorities are assigned by Cloudflare, copy them):

| Type | Full name | Exact value or account-generated value |
| --- | --- | --- |
| MX | `vacate.dev` | `route1.mx.cloudflare.net` |
| MX | `vacate.dev` | `route2.mx.cloudflare.net` |
| MX | `vacate.dev` | `route3.mx.cloudflare.net` |
| TXT | `vacate.dev` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf2024-1._domainkey.vacate.dev` | Full generated `v=DKIM1; h=sha256; k=rsa; p=…` public key from Routing settings |

The DKIM key and MX priorities are generated at onboarding and cannot be supplied
beforehand. Never paste the ellipsis as a record. Copy the complete records from
Cloudflare's verified DNS screen. [DNS configuration](https://developers.cloudflare.com/email-service/configuration/domains/).

Create **one** `support` rule → **Send to a Worker**. Multiple rules for the same
address do not fan out: only the first is applied. The Email Worker calls
`message.forward(destination)` for each verified team member. Configure a private
`TEAM_DESTINATIONS` JSON array of the four actual addresses and `SUPPORT_ADDRESS`
from `support@$VACATE_DOMAIN` in Worker settings. No real addresses belong in git.
A deployment-ready handler pattern for the orchestrator to review:

```js
export default {
  async email(message, env) {
    if (message.to.toLowerCase() !== env.SUPPORT_ADDRESS.toLowerCase()) {
      message.setReject("Unknown recipient");
      return;
    }
    const destinations = [...new Set(JSON.parse(env.TEAM_DESTINATIONS))];
    if (destinations.length !== 4) throw new Error("Configure all four team destinations");
    const results = await Promise.allSettled(destinations.map(to => message.forward(to)));
    // Do not retry every recipient after partial delivery: that can duplicate mail.
    const failed = results.filter(result => result.status === "rejected").length;
    if (failed) console.error(`Support forwarding failures: ${failed}/${results.length}`);
  },
};
```

Monitor routing activity/failure counts and reconcile failed recipients before
manual resend; this minimal handler does not promise exactly-once delivery.
[Email Worker forwarding API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/).
User/orchestrator then sends an approved test from a different mailbox and confirms
all four recipients received it. Use this address for Anthropic connector-directory
support only once tested. Routing is free; Worker execution follows Workers quotas.

## 6. Supabase custom SMTP — user approval, then orchestrator

**Recommendation: Cloudflare Email Service SMTP**, subject to the user's approval
of the account's Workers Paid billing. Current official docs confirm SMTP:
`smtp.mx.cloudflare.net:465`, implicit TLS, username `api_token`, password an
account-owned Cloudflare API token with **Email Sending: Edit**. The token can
send for onboarded domains in its account: protect it as a server credential.
[SMTP reference](https://developers.cloudflare.com/email-service/api/send-emails/smtp/),
[SMTP examples](https://developers.cloudflare.com/email-service/examples/email-sending/smtp/).

Workers Paid starts at **$5/month per account**, including **3,000 outbound emails
per month**, then **$0.35/1,000**. If this account already pays for Workers, no
second base subscription is needed; usage is shared. Email Routing is unlimited;
its Worker execution is separately metered under the plan. Verify account plan
and Email Sending availability before choosing it; neither was inspected here.
[Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Orchestrator onboards the domain under **Email Sending**, separate from Routing.
Keep the inbound root MX records. Sending adds:

| Type | Name | Value |
| --- | --- | --- |
| MX × 3 | `cf-bounce.vacate.dev` | `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`; generated priorities |
| TXT | `cf-bounce.vacate.dev` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf-bounce._domainkey.vacate.dev` | Complete generated sending DKIM public key, distinct from routing DKIM |
| TXT | `_dmarc.vacate.dev` | Start with `v=DMARC1; p=none;`; move to `v=DMARC1; p=reject;` after delivery/authentication tests |

Cloudflare may create a reject DMARC policy automatically; review the policy at
onboarding. Maintain only one DMARC record. The two DKIM selectors coexist.
With Cloudflare for both sending/routing, the root SPF stays exactly
`v=spf1 include:_spf.mx.cloudflare.net ~all`: there is no second provider include
to merge, and the sending envelope uses `cf-bounce` with its own SPF.
[Sending/routing records](https://developers.cloudflare.com/email-service/configuration/domains/).

If a different SMTP provider requires SPF at the **same DNS name**, merge its
include before the final `~all` into the one existing SPF record, e.g.
`v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all` for Google
Workspace (example only, not the selected provider). Never create two `v=spf1`
records at the same name. If its return-path is a separate subdomain, publish
its SPF there instead. Keep total SPF lookups within ten; preserve each provider's
distinct DKIM selector and Cloudflare's root MX.
[SPF coexistence](https://developers.cloudflare.com/email-service/concepts/email-authentication/).

Supabase → project → Authentication → Email → SMTP Settings:

| Setting | Value |
| --- | --- |
| Enable custom SMTP | On |
| Sender address | `support@vacate.dev` |
| Sender name | `Vacate` |
| Host | `smtp.mx.cloudflare.net` |
| Port | `465` (implicit TLS, not STARTTLS 587) |
| Username | `api_token` |
| Password | Private Email Sending API token; never put in TOML/git/client env |
| Minimum interval per user | Keep 60 seconds |

Built-in Supabase mail only delivers to organization team addresses and is not a
public signup service. Custom SMTP removes that recipient restriction; configure
Auth rate limits for expected traffic (custom SMTP initially has a low limit),
keep confirmations enabled, and test an approved external signup/reset flow.
Do not enable link tracking that rewrites auth links. Verify delivery, SPF/DKIM/
DMARC pass and confirmation returning to the new app. No email has been sent by
this preparation task. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 7. Verification and rollback — orchestrator

Run from `web/`:

```bash
npm run domain:check
VACATE_DOMAIN=ai-moveout-automation-agent-tau.vercel.app npm run domain:check
# App-only verification of the old host (no custom DNS/mail/www expectations):
VACATE_DOMAIN=ai-moveout-automation-agent-tau.vercel.app npm run domain:check -- --app-only
```

The dependency-free check uses public Cloudflare DoH, current Cloudflare IPv4/IPv6
edge ranges, verified TLS/SNI, manual redirects and anonymous HTTP. It checks
both names, Routing MX, app routes, metadata, MCP challenge and Supabase discovery.
It never registers an OAuth client or sends a token. Exit 1 means at least one
failure. DNS recognizes project Vercel CNAMEs, public Vercel targets and known
apex addresses; a new unrecognized apex allocation fails conservatively and must
be compared with Domains settings. This is one resolver's view, not proof of
worldwide propagation or a read of the Cloudflare proxy toggle. Sources:
[DoH JSON](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/),
[Cloudflare IP ranges](https://www.cloudflare.com/ips/).

If cutover fails, user approves rollback; orchestrator restores the recorded
Supabase Site URL (`https://ai-moveout-automation-agent-tau.vercel.app`) and the
previously recorded exact callback allow-list; retain explicit localhost callback entries. Restore
Production `APP_URL`/share URL and connector defaults to the old origin and
redeploy if needed. In Vercel **project Settings → Domains**, remove the apex and
www assignments (not registrar ownership). Leave the old Vercel alias attached.
Do not cancel domain registration or remove Cloudflare email records as part of
app rollback. Recheck old-host login and OAuth. The Vercel alias continues to
resolve throughout; with the existing “all except custom domains” protection it
may require Vercel access if protection applies, so verify public reachability
before relying on it as an external connector fallback.

## Local verification evidence

See [DOMAIN_CHECKS.md](DOMAIN_CHECKS.md) for commands, actual results and both
public probe tables. Supabase's [changelog](https://supabase.com/changelog.md) was
also checked: the upcoming [CBC TLS cipher retirement](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) needs no config change for
these modern Node TLS probes. No hosted configuration has been applied.

### Auth-owner handoff before cutover

Dynamic secondary-host callbacks need a fixed callback plus a validated return
cookie in `web/src/components/google-sign-in.tsx:18`, `web/src/app/login/actions.ts:24`,
`web/src/app/start/actions.ts:29` and `web/src/app/auth/callback/route.ts`.
Those files are outside this prep change. The apex same-origin path is unaffected;
keep the custom redirect configuration unapplied until the hosted flows are tested.
