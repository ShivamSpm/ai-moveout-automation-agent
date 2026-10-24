---
name: moving-schema
description: Change the moving assistant's Supabase schema, private storage policies and generated database types through the monorepo's single migration history.
---

Read docs/MONOREPO.md and the affected requirements. Verify the target project
identity and current Supabase docs before mutations. Use the root supabase/migrations
history and CLI-generated migration filenames; do not create per-app histories.

Keep ownership constraints, private storage access, reviewed-action versions and
item reservation concurrency enforceable in persistence. Check access using two
different users, including direct record/file identifiers. Regenerate packages/db
types and check consumers after schema changes. Never reset a shared database or
assume a service key makes a user-scoped operation authorized. Report applied vs
authored migrations separately and use synthetic fixtures.
