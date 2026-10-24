-- Telegram selling lane: the renter approves each listing, a bot posts it to a
-- public channel, and the agent negotiates with each buyer in a private chat.
-- Buyer replies within the renter's price floor and pickup cutoff go out
-- without review (user decision, Oct 24); confirming a deal and sharing the
-- pickup address stay behind the reviewed pickup.confirm action.

alter table public.listings drop constraint listings_channel_check;
alter table public.listings add constraint listings_channel_check
  check (channel in ('facebook_marketplace', 'craigslist', 'buy_nothing', 'vinted', 'in_app', 'telegram'));

alter table public.conversations drop constraint conversations_source_check;
alter table public.conversations add constraint conversations_source_check
  check (source in ('in_app', 'manual_entry', 'muse', 'telegram'));

-- "agent": an automatic reply the negotiating agent sent within the renter's limits.
alter table public.messages drop constraint messages_source_check;
alter table public.messages add constraint messages_source_check
  check (source in ('in_app', 'manual_entry', 'muse', 'app_reply', 'telegram', 'agent'));

-- Per-buyer negotiation state. external_thread_ref holds the Telegram chat id;
-- one chat can talk about several listings, and the last one it opened is active.
alter table public.conversations
  add column last_active_at timestamptz not null default now(),
  add column deal_status text not null default 'negotiating'
    check (deal_status in ('negotiating', 'awaiting_seller', 'confirmed', 'closed')),
  add column offer_cents integer check (offer_cents >= 0);
create index conversations_telegram_chat_idx
  on public.conversations (external_thread_ref, last_active_at desc) where source = 'telegram';

-- Telegram redelivers an update until it gets a 200; each update_id is handled once.
-- Service role only: no policies, so the Data API cannot read or write it.
create table public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);
alter table public.telegram_updates enable row level security;
revoke all on public.telegram_updates from anon, authenticated;
