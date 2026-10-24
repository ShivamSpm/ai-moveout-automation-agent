# Custom-domain preparation verification

Checked October 24, 2026 after merging main at `744cfdc` into the preserved
`feat/custom-domain` worktree. No purchase, assignment, DNS write, config push,
SMTP configuration or email send was performed.

## Local checks

```text
npm ci
added 480 packages, and audited 481 packages in 4s
found 0 vulnerabilities
npx next typegen
✓ Types generated successfully
npx tsc --noEmit
(exit 0, no output)
npm run lint
> eslint
(exit 0)
npm test
Test Files 37 passed (37)
Tests 333 passed (333)
Duration 1.61s
npm run build
✓ Compiled successfully in 1632ms
Finished TypeScript in 2.5s
✓ Generating static pages using 17 workers (40/40) in 232ms
claude plugin validate .
✔ Validation passed
supabase db lint --local
No schema errors found
git diff --check
(exit 0, no output)
```

## Public read-only probes

The full custom-domain check is deliberately stricter than the old Vercel alias:
that alias has no Cloudflare delegation/mail and its nested `www` name does not
have valid TLS. The seven application checks all pass in `--app-only` mode.
`vacate.dev` returns NXDOMAIN and is not ready for cutover. These failures are
infrastructure work still owned by Jorge/team, not passing checks.

### Existing Vercel host, full check (exit 1)

```text
> moveout-agent@0.1.0 domain:check
> node scripts/domain-check.mjs


Domain check: https://ai-moveout-automation-agent-tau.vercel.app (2026-10-24T22:54:19.541Z)
PASS | Cloudflare edge IP ranges | OK
FAIL | Cloudflare nameservers | Observed NS: none
PASS | DNS-only Vercel: ai-moveout-automation-agent-tau.vercel.app | 64.29.17.195, 216.198.79.195
PASS | DNS-only Vercel: www.ai-moveout-automation-agent-tau.vercel.app | 216.198.79.195, 64.29.17.195
FAIL | Cloudflare Email Routing MX | Observed MX: none
PASS | TLS: ai-moveout-automation-agent-tau.vercel.app | valid through Nov 27 19:48:08 2026 GMT
FAIL | TLS: www.ai-moveout-automation-agent-tau.vercel.app | Hostname/IP does not match certificate's altnames: Host: www.ai-moveout-automation-agent-tau.vercel.app. is not in the cert's altnames: DNS:*.vercel.app
FAIL | www → apex 308 | fetch failed (ERR_TLS_CERT_ALTNAME_INVALID)
PASS | GET / | HTTP 200
PASS | GET /login | HTTP 200
PASS | Agent Card custom origin | OK
PASS | OAuth resource metadata | OK
PASS | Unauthenticated MCP 401 + challenge | OK
PASS | Supabase OAuth discovery | OK
10/14 passed; 4 failed.
```

### Custom domain, full check (exit 1)

```text
> moveout-agent@0.1.0 domain:check
> node scripts/domain-check.mjs


Domain check: https://vacate.dev (2026-10-24T22:54:19.551Z)
PASS | Cloudflare edge IP ranges | OK
FAIL | Cloudflare nameservers | vacate.dev NS: DNS status 3  3 !== 0
FAIL | DNS-only Vercel: vacate.dev | vacate.dev AAAA: DNS status 3  3 !== 0
FAIL | DNS-only Vercel: www.vacate.dev | www.vacate.dev A: DNS status 3  3 !== 0
FAIL | Cloudflare Email Routing MX | vacate.dev MX: DNS status 3  3 !== 0
FAIL | TLS: vacate.dev | getaddrinfo ENOTFOUND vacate.dev
FAIL | TLS: www.vacate.dev | getaddrinfo ENOTFOUND www.vacate.dev
FAIL | www → apex 308 | fetch failed (ENOTFOUND)
FAIL | GET / | fetch failed (ENOTFOUND)
FAIL | GET /login | fetch failed (ENOTFOUND)
FAIL | Agent Card custom origin | fetch failed (ENOTFOUND)
FAIL | OAuth resource metadata | fetch failed (ENOTFOUND)
FAIL | Unauthenticated MCP 401 + challenge | fetch failed (ENOTFOUND)
PASS | Supabase OAuth discovery | OK
2/14 passed; 12 failed.
```

### Existing Vercel host, app-only (exit 0)

```text
> moveout-agent@0.1.0 domain:check
> node scripts/domain-check.mjs --app-only


Domain check: https://ai-moveout-automation-agent-tau.vercel.app (2026-10-24T22:54:27.459Z)
PASS | TLS: ai-moveout-automation-agent-tau.vercel.app | valid through Nov 27 19:48:08 2026 GMT
PASS | GET / | HTTP 200
PASS | GET /login | HTTP 200
PASS | Agent Card custom origin | OK
PASS | OAuth resource metadata | OK
PASS | Unauthenticated MCP 401 + challenge | OK
PASS | Supabase OAuth discovery | OK
7/7 passed; 0 failed.
```

## Remaining evidence

Jorge buys the domain; the release operator then needs explicit authorization to
attach it, configure the provided Cloudflare zone, wait for HTTPS and apply the
reviewed Supabase URL configuration. Team destinations must be verified before
support forwarding; custom SMTP and its billing need a provider/account decision.
No authenticated custom-domain sign-in, external signup email, forwarding or
Claude/Muse OAuth journey has been exercised.

The exact callback list covers normal destinations. Dynamic secondary-host invite
and OAuth return queries need the auth-owner handoff in [DOMAIN.md](DOMAIN.md)
before cutover. No redirect wildcard is proposed. The current localhost fallback
is port 3000; set local `APP_URL` to the actual dev port for connector testing.

The runbook cites current official Vercel, Cloudflare, Supabase and Google Registry
documentation. Cloudflare now documents SMTP; recommendation and cost are subject
to actual account availability and Jorge's approval. No private environment file
was changed or committed.
