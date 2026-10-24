# Integration capability register

As of bootstrap: no provider is configured or tested in this repository.
Documentation availability is evidence of a possible integration, not account access.

Primary paths after whiteboard clarification: Gmail + Calendar and Facebook
Marketplace through Muse, including live buyer messaging as the goal. Muse access
needs testing. Bland calls and mover/cleaner discovery/booking are stretch today.
Use [MUSE_SPIKE.md](MUSE_SPIKE.md) for the early capability check.

| Provider | Intended role | First validation | Fallback |
| --- | --- | --- | --- |
| Vercel | Hosted web app and bounded backend routes | Project/team access, preview URL, auth redirects and runtime limits | Local development until hosting is available |
| Supabase | Auth, moves, actions, private documents/photos | New dedicated dev project, ownership policies and private storage | Synthetic local fixture mode, explicitly labeled |
| OpenRouter | Server-side Claude model, optional structured vision/extraction | Account credit, exact model and required modalities/tools | Show configuration error; no silent provider switch |
| Gmail | Draft/send landlord and vendor email, track selected threads | Scoped OAuth, permitted test users, draft then consented send | Editable email draft |
| Google Calendar | Deadlines, calls, inspections and service visits | OAuth, timezone and attendee/invite behavior | Event preview/export |
| Apify | Discover allowed public service/listing information | Selected Actor's contract, access, cost and result quality | User-provided links or manual shortlist |
| Bland | Authorized calls for inquiries and scheduling | Dedicated account, approved test recipient, duration/cost cap and result callback | Call brief |
| Meta Muse | Renter's own agent performs approved Facebook Marketplace posts/messages | Built: A2A 1.0 + MCP bridge, tested with a simulated client. Pending: custom connector on a real Muse account | Listing draft and explicit user handoff |
| Craigslist | Listing preparation, publication if authorized mechanism exists | Verify current official posting/access options for target category | Copy-ready listing with manual publication |
| Buy Nothing | Local giving with community-specific rules | Identify app vs Facebook group and supported account integration | Giving post draft and user handoff |
| Vinted | Clothing/item sale preparation and supported account actions | Verify official integration availability and relevant seller eligibility | Copy-ready listing and manual publication |
| U-Haul / movers / cleaners | Availability, quotes, authorized bookings | Provider-specific API/partner access or consented call workflow | Quote request and booking handoff |

Apify discovery is not permission to publish listings, read private inboxes or
bypass account access controls. No universal marketplace publishing API is assumed.
Each marketplace adapter should report capabilities such as `draft`, `publish`,
`read_messages`, `reply`, `change_price` and `mark_sold` independently.

## Configuration inventory (names only; proposed until code selects them)

- Vercel deployment project/team and development/production URLs.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SECRET_KEY` only if a documented server-only task requires it.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `APIFY_TOKEN`, `BLAND_API_KEY`.
- Credential-encryption and callback-validation configuration as adapters require.
- Muse connector authentication selected after the connector path is verified.

Use `.env.local` for local values and each deployment's secret store for hosted
values. Do not reuse another project's accounts or credentials. Gmail/Calendar
user OAuth grants are distinct from Supabase sign-in. Request only needed scopes;
check consent-screen/test-user restrictions before choosing the demo path.

## Official references checked during bootstrap

- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Supabase changelog](https://supabase.com/changelog)
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart)
- [Gmail draft creation/sending](https://developers.google.com/workspace/gmail/api/guides/drafts)
- [Calendar event creation](https://developers.google.com/workspace/calendar/api/guides/create-events)
- [Apify integrations](https://docs.apify.com/integrations)
- [Bland outbound calls](https://docs.bland.ai/api-v1/post/calls)
- [Muse connector guidelines](https://platform.muse.ai/docs)

Muse documents services exposed to Muse via API/MCP, connector review and sensitive
action permissions. A public API to remotely start/control the personal Muse
session has not been established here. Do not build the critical demo path on that
assumption. Craigslist, Buy Nothing, Vinted and booking integration capabilities
remain unverified and must be researched before implementation claims.

The user's review policy applies across providers, including Muse. Do not disable
Muse's native permission controls to imitate web-app approval. If an approval
cannot be carried across the boundary, show the required Muse handoff honestly.
No landlord-side eviction workflow may be passed to another provider for execution.
