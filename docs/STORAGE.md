# Private documents and household access

Implemented on `feat/lease-storage`. Migration:
`20261024203125_household_documents.sql`. Apply from the repository root with
`supabase migration up --local`; regenerate `web/src/server/db/database.types.ts`
with `supabase gen types typescript --local`. Hosted migration/deployment belongs
to the orchestrator. No hosted changes are part of this work.

## Storage API, credentials and paths

Use supabase-js Storage with the signed-in user's session and the existing private
`move-files` bucket. Storage RLS applies. No S3 keys are used: Supabase's generated
S3 access keys bypass RLS and expose all buckets. The server secret key is used
only for `auth.admin.deleteUser` in this feature, after verifying the session.
Test fixtures use local admin credentials to create/clean synthetic test accounts.

Lease paths are `{owner_id}/{move_id}/{document_id}.pdf`. The server generates the
UUID and derives the owner from `requireUser()`. Registration reconstructs the
path instead of trusting a client-supplied owner/path. Documents cannot point into
another owner's folder; the constraint is NOT VALID for historical rows but applies
to all new inserts/updates, and the sharing helper independently checks the folder.
Existing owner-folder Storage policies remain intact.

## Visibility and authority

| Data or operation | Owner | Active, unexpired member | Pending / revoked / expired / stranger |
| --- | --- | --- | --- |
| Own move, including private address field | Read/write | No raw `moves` access | None |
| Safe move summary RPC | Read | ID, title, date, household and owner IDs only | None |
| Shared document metadata and original file | Read/write/delete | Read | None |
| Unshared document | Read/write/delete | None | None |
| Findings and lease tasks from shared document | Read/write | Read | None |
| Owner's task status or file upload/delete | Write | Forbidden | Forbidden |
| Owner's actions, messages, connector tokens | Existing owner access | None | None |

Sharing a lease can reveal an address *within the PDF or a quoted clause*. Hiding
`moves.address_private` does not redact the original document. The account page
explains this before household sharing. General tasks without a shared source
document are not exposed to members; completed tasks retained after deletion are
also owner-only. An issued signed download link remains usable for its remaining
60 seconds. Revocation/unsharing prevents new reads and new signed links; it
cannot recall a downloaded copy or an already issued link.

Households use composite `(id, owner_id)` constraints when attached to moves.
Only the move owner can attach their own household. Read policies call narrowly
scoped `SECURITY DEFINER` helpers in `private`, with empty search paths and fully
qualified names. Public RPC wrappers are security invokers. The safe move RPC
explicitly checks owner/membership and selects only allowed columns. Other tables'
owner policies are unchanged.

Membership writes are restricted to invitation/acceptance/revocation RPCs. An
invite uses 32 random bytes; only its SHA-256 hash is persisted. The raw link is
shown once for copying, never emailed. Acceptance requires a confirmed account
email matching the invitation, an unused token and a seven-day invitation expiry.
Acceptance consumes the token; active membership lasts until revoked or left.
An explicit membership expiry, if present, is honored. Reinviting a revoked member
requires accepting a fresh invitation. Household ownership is recorded on
`households.owner_id`; invite rows are member roles, not delegated owners.
Membership never grants action, account or belongings authority (D17, HOUSE-05).

## Upload, verification and lease reading

1. The authenticated server verifies move ownership and creates a signed upload
   URL for one generated path. Supabase signed upload capabilities last two hours.
2. The browser uploads directly to Storage with supabase-js; PDF bytes do not pass
   through a Next server action. Browser checks require PDF, nonzero size, <=20 MB;
   the bucket independently enforces its size/MIME limits.
3. `registerDocument` downloads through the user's session, checks MIME, size and
   the PDF signature, hashes the unchanged bytes on the server and parses/counts
   pages with `unpdf`. It inserts lease metadata with upload time, SHA-256 and pages.
4. A failed validation/registration removes an unregistered object. A successfully
   registered file is preserved if subsequent persistence fails, so Re-read can
   recover. A concurrent successful registration is checked before orphan cleanup.
   Interrupted browser uploads can leave orphans; account deletion sweeps them.
5. Text is extracted per page and fed only to `extractLeaseFindings`. All five
   rules, including unresolved ones, are saved with document, page, quote,
   confidence and `extractor='pattern'`. Text is data, never instructions or
   authority. No model or external action is called. `LeaseExtractor` is the typed
   future adapter boundary; vision remains unimplemented.
6. `leaseRulesFrom` and `buildPlan` produce dates in code. Only tasks with resolved
   lease sources are persisted as lease tasks; the reader's fallback notice
   period and generic California/SF information are not presented as lease facts.
   Missing move-out date stores findings and prompts for a date. No text stores
   unresolved findings and displays “We couldn't read text in this PDF”.
7. A checked, transactional RPC replaces findings and upserts `(move_id, task_key)`.
   It preserves current database task status even if a status changes concurrently,
   retains done history, and removes vanished unfinished/skipped lease tasks for
   the document. Tasks track `document_id` for sharing and deletion. Multiple
   leases use the last read source for a matching task key; compare originals if
   leases disagree. Changing the move date requires Re-read to rebuild dates.

A hash identifies file bytes, and upload time records receipt by the application.
Neither proves capture time, legal responsibility or landlord agreement. Pattern
findings require renter review; they are not legal advice or a complete lease audit.

## File and account deletion

File deletion confirms intent, deletes the Storage object first, then deletes the
metadata row. Findings cascade. A trigger removes unfinished lease tasks before
removing the document; done tasks remain with a null document reference. A retry
can finish deleting metadata after a prior successful object removal.

Account deletion requires the exact phrase `DELETE MY ACCOUNT`, a verified user
and a verified JWT issued within ten minutes. The UI prompts a fresh sign-in if
that check fails. This checks JWT issuance as requested, not password entry time;
a token refresh can issue a new JWT. Other active household members block deletion,
with a second database guard on auth-user deletion (no silent ownership transfer).

Order:

1. List every page under the verified `{user_id}/` prefix, recursively including
   nested folders and unregistered uploads, and remove files through the user's
   Storage API. Collect each folder's pages before deleting to avoid offset skips.
   Any Storage error stops account deletion.
2. Revoke the user's connector tokens through their scoped client.
3. Call `serviceClient().auth.admin.deleteUser(verifiedUser.id)`. Foreign keys
   cascade application rows and credentials. No client-supplied ID is accepted.
4. Sign out and redirect to `/` with a fixed goodbye banner.

Retries before auth deletion repeat the sweep/revocation safely. The Storage
service also refuses auth deletion while that user still owns stored objects.
Concurrent uploads/acceptances can cause deletion to fail and require retry or
member removal; the database guard prevents deleting an active household.
Already sent emails, posted Facebook listings and downloaded copies are not
removed. The page explains this before confirmation.

## Retention and verification

No automatic expiry or orphan sweep is scheduled. Q18 (production retention and
export policy) remains open. Users can download originals and delete individual
files or their account. This feature does not implement a complete structured
account export or photo collaboration (HOUSE-02).

Tests use only `fixtures/synthetic/lease.pdf`, generated deterministically from
`lease-pages.ts` using `generate-lease.ts`. From `web/`, regenerate with
`npx tsx ../fixtures/synthetic/generate-lease.ts`. Integration tests require the
local stack and refuse a nonlocal Supabase URL; they cover owner/member/stranger/
pending and expired access, direct IDs/paths, invite checks, reconciliation,
cleanup failure, pagination, deletion and account closure. Unit tests cover task
reconciliation and refusal to guess missing dates/rules.

## Official documentation checked

- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Storage SQL helper functions](https://supabase.com/docs/guides/storage/schema/helper-functions)
- [Signed upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
- [S3 authentication and access-key bypass](https://supabase.com/docs/guides/storage/s3/authentication)
- [Admin user deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
- [Supabase changelog](https://supabase.com/changelog.md)

Browser smoke check (local port 3102): verified the page-level login redirect,
account/files rendering, stored PDF metadata, Re-read lease action, cited findings,
grouped checklist and persisting a done status. The extension's file-URL permission
blocked the browser file chooser; the same PDF was uploaded/registered through the
actual server functions with the signed-in synthetic account instead. Browser
file selection remains a manual check. Screenshot: `verification/lease-storage-plan.png`.
