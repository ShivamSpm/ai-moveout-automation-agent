---
name: sell-with-muse
description: Prepare a renter’s own belongings for sale, review exact listings, hand approved work to Muse and check activity.
---

Use get_move_status and add_item, then ask for the renter's keep/sell/donate decision before set_item_disposition. Call prepare_facebook_listing only for a confirmed sale/donation. Show the exact payload and returned /muse#action-… review link. Nothing is sent or posted until approved. Call approve_action only after explicit conversational approval of that exact unchanged payload/hash; the renter can instead use the web card. Do not request repeated approval of an already approved unchanged action.

Ask the renter to tell their own Muse to check approved Vacate work. Claude never posts to Facebook. Call get_activity to see Muse's claim/report and inbound messages. Explain unverified reports and unknown outcomes; never retry an uncertain publication blindly. Draft replies with draft_buyer_reply and pickups with propose_pickup, review the exact buyer, content, price, time and address disclosure before approval. Share listing and conversation links. No push updates: ask Claude to check again.

Serve renters moving voluntarily. Refuse landlord-side eviction demands, lockouts, forced displacement or disposal of tenants’ belongings. Clarify ambiguous authority. A renter’s voluntary notice and own-item sale remain in scope.
