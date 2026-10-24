# Agent standards and SDK baseline

Official sources checked October 24, 2026. Recheck concrete package releases when
installing; protocol revisions and SDK package versions are different things.

## Muse developer SDK — requested technology

The official [Muse Code SDK repository](https://github.com/meta-models/muse-code-sdk)
documents the TypeScript package `@muse-code/sdk`, Node.js 20+ and a developer-preview
API. It drives Muse Code sessions using MSP (Muse Session Protocol).
[Meta's Muse Code guide](https://dev.meta.ai/docs/muse-code) documents `muse serve`
and `muse schema`. Pin a compatible SDK/host pair and record the schema fingerprint;
do not rely on unpinned preview behavior. No SDK was installed in this session.

This establishes a developer runtime, not access to the user's consumer Muse or
Facebook Marketplace account. Keep that connector capability test explicit.
[Muse connector guidelines](https://platform.muse.ai/docs) govern the separate
API/MCP integration surface. Do not call MSP an A2A endpoint or a Facebook API.

## A2A for independently running agents

Use the official [A2A specification](https://a2a-protocol.org/latest/specification/)
and matching official SDK. The retrieved page labels its released specification
`1.0.0`; wire negotiation uses `1.0`, not a patch number. Do not copy old 0.3
examples into a 1.0 contract. Verify selected SDK support before implementation.

Advertise only implemented Agent Card capabilities. Model work as durable tasks
with artifacts, authenticated user context, cancellation, progress and resumable
status. Define mappings between protocol task states and domain action states;
protocol completion alone does not prove a sale or booking. Persist identity,
task IDs, correlation IDs and outcomes with tenant isolation. Treat push callback
URLs as untrusted and prevent arbitrary server-side network access.

## MCP for tools and resources

The official [latest MCP specification](https://modelcontextprotocol.io/specification/latest)
resolved to **2026-07-28** during this session. Use a mutually supported version
with the target Claude/Muse client; "latest" does not prove client compatibility.
Keep version-specific transport/discovery behavior in the gateway and add a
compatibility test. Document any deliberately older compatible revision.

Expose narrow validated operations with clear read/write effects. Implement
authenticated user scoping, least-privilege access and actual server checks;
annotations and model instructions alone do not enforce authorization. MCP task
support is an optional extension in the reviewed spec: verify client support
instead of assuming every client can run durable background tasks.

## Application responsibilities beyond protocols

The database owns action authorization, immutable payload versions, idempotency,
item reservations and audit events. SDK session state is not the source of truth.
Token budgets, concurrency, timeouts and cancellation are bounded. Never expose a
general coding shell to renter inputs or provider credentials. Isolate worker
workspaces and tool access; prefer application tools for consumer operations.

Contract tests cover unauthorized task reads, forged approvals, duplicate messages,
replayed callbacks, timeout reconciliation, unsupported versions, cancellation and
the landlord-side eviction prohibition. No automatic delegation of coding agents
is authorized merely by adopting A2A for the product.
