-- Where each seller's Telegram listings are posted. A seller links a group by
-- adding the shared bot through the add-to-group link on /sell; the webhook
-- verifies the signed link code and records the group here. Without a row,
-- listings go to the app's default sale channel.

create table public.telegram_targets (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  chat_id text not null,
  chat_title text,
  chat_username text,
  linked_at timestamptz not null default now()
);
alter table public.telegram_targets enable row level security;
create policy telegram_targets_owner_read on public.telegram_targets for select to authenticated
  using (owner_id = (select auth.uid()));
create policy telegram_targets_owner_delete on public.telegram_targets for delete to authenticated
  using (owner_id = (select auth.uid()));
-- Linking happens only through the verified webhook (service role).
revoke insert, update on public.telegram_targets from anon, authenticated;
