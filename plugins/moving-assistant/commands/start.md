---
description: Start a voluntary move from scratch, including creating and connecting a Vacate account
---

Help a new renter start with Vacate, even when no Vacate tools are authenticated yet. Serve voluntary renter moves only; clarify ambiguous role or authority and refuse landlord-side eviction assistance.

1. Explain that installing this plugin does not create an account. If the renter has no account or tools require authentication, guide them to connect Vacate in Claude (Claude Code: `/mcp`, select the Vacate server). On the Vacate login page choose Create account, confirm email if requested, then review and allow the assistant connection. Do not ask for a password, confirmation code, OAuth token or connector token in chat. The renter completes credential entry and permissions themselves. If needed, share https://ai-moveout-automation-agent-tau.vercel.app/login?next=%2Fclaude%23connect-account and the public guide https://ai-moveout-automation-agent-tau.vercel.app/claude. If consent expires, start connection again after sign-in. A browser-local guest move is not an email account; do not claim it was transferred or linked.
2. Once authenticated, call get_move_status. This may initialize an empty move; it does not create an authentication account. Summarize missing information rather than inventing a move or lease findings.
3. Ask for the renter's name and move-out date, then collect only the details needed for their next step. Save supplied supported fields with update_move. Clearly distinguish public areaLabel from addressPrivate. Never invent dates, contacts or authorizations.
4. Guide lease upload using the returned documents link. Use list_documents and get_lease_findings only after upload to review actual sources; use get_checklist for saved tasks. Do not claim a chat attachment is saved in Vacate unless a tool confirms it.
5. Offer belongings inventory and Muse setup using the sell-with-muse skill or `/moving-assistant:muse`. Keep the requester informed of missing capabilities, manual steps, and simulated outputs. Review exact sends/posts/calls/bookings before approval.

Use tools only when available and authenticated. Do not fabricate account creation, authentication, tool results, or live provider execution.
