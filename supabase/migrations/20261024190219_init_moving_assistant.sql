-- Moving assistant schema v1: one renter owns each move and everything under it.
-- Ownership is enforced three ways: owner_id defaults to auth.uid(), RLS limits
-- rows to their owner, and composite foreign keys stop a child row from pointing
-- at another user's parent. Reviewed external actions are bound to a hash of
-- their exact payload computed by the database.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- helpers

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- moves

create table public.moves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Anti-eviction boundary: the assistant only serves the renter who is moving.
  party_role text not null default 'renter' check (party_role = 'renter'),
  title text not null default 'My move',
  area_label text,                         -- general area only, never the exact address
  address_private text,                    -- exact address, shown only to the owner
  move_out_date date,
  move_in_date date,
  timezone text not null default 'America/Los_Angeles',
  deposit_cents integer check (deposit_cents >= 0),
  landlord_name text,
  landlord_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index moves_owner_idx on public.moves (owner_id);
create trigger moves_touch before update on public.moves
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- documents

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  kind text not null check (kind in ('lease', 'photo', 'other')),
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer,
  uploaded_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade
);
create index documents_move_idx on public.documents (move_id);
create index documents_owner_idx on public.documents (owner_id);

-- ---------------------------------------------------------------- lease findings

create table public.lease_findings (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  document_id uuid,
  rule_key text not null,                  -- e.g. notice_days, carpet_cleaning
  value jsonb,
  quote text,                              -- verbatim text the finding came from
  page integer check (page > 0),
  confidence text not null check (confidence in ('high', 'medium', 'low', 'unresolved')),
  extractor text not null check (extractor in ('model', 'pattern', 'user')),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade,
  foreign key (document_id, owner_id) references public.documents (id, owner_id) on delete cascade
);
create index lease_findings_move_idx on public.lease_findings (move_id);
create index lease_findings_owner_idx on public.lease_findings (owner_id);
create index lease_findings_document_idx on public.lease_findings (document_id);

-- ---------------------------------------------------------------- checklist

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  task_key text not null,
  lane text not null check (lane in ('landlord', 'cleaning', 'moving', 'selling', 'admin')),
  phase text not null default 'move_out' check (phase in ('move_out', 'move_in')),
  title text not null,
  detail text,
  due_date date,
  source text,
  source_kind text not null check (source_kind in ('lease', 'general_info', 'plan')),
  status text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  unique (move_id, task_key),
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade
);
create index tasks_owner_idx on public.tasks (owner_id);

-- ---------------------------------------------------------------- items

create table public.items (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  name text not null,
  category text,
  condition text,
  description text,
  disposition text not null default 'undecided'
    check (disposition in ('undecided', 'keep', 'sell', 'donate')),
  disposition_confirmed boolean not null default false,
  ask_cents integer check (ask_cents >= 0),
  floor_cents integer check (floor_cents >= 0),
  status text not null default 'inventory'
    check (status in ('inventory', 'listed', 'reserved', 'handed_over', 'withdrawn')),
  proposed_by text not null default 'user' check (proposed_by in ('model', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade,
  check (floor_cents is null or ask_cents is null or floor_cents <= ask_cents)
);
create index items_move_idx on public.items (move_id);
create index items_owner_idx on public.items (owner_id);
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

create table public.item_photos (
  item_id uuid not null,
  document_id uuid not null,
  owner_id uuid not null default auth.uid(),
  primary key (item_id, document_id),
  foreign key (item_id, owner_id) references public.items (id, owner_id) on delete cascade,
  foreign key (document_id, owner_id) references public.documents (id, owner_id) on delete cascade
);
create index item_photos_owner_idx on public.item_photos (owner_id);
create index item_photos_document_idx on public.item_photos (document_id);

-- ---------------------------------------------------------------- listings

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  owner_id uuid not null default auth.uid(),
  channel text not null
    check (channel in ('facebook_marketplace', 'craigslist', 'buy_nothing', 'vinted', 'in_app')),
  -- live: our adapter published it; manual_handoff: the renter published it and
  -- reported the link; simulated: never left the app.
  mode text not null check (mode in ('live', 'manual_handoff', 'simulated')),
  title text not null,
  body text not null,
  price_cents integer not null check (price_cents >= 0),
  area_label text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'failed', 'withdrawn')),
  external_url text,
  external_ref text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (item_id, owner_id) references public.items (id, owner_id) on delete cascade
);
create index listings_item_idx on public.listings (item_id);
create index listings_owner_idx on public.listings (owner_id);

-- A kept or unconfirmed item never enters the publication queue.
create or replace function public.listings_require_sale_item() returns trigger
language plpgsql set search_path = '' as $$
declare d text; c boolean;
begin
  select disposition, disposition_confirmed into d, c from public.items where id = new.item_id;
  if d not in ('sell', 'donate') or not c then
    raise exception 'item % is not confirmed for sale or donation', new.item_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger listings_sale_item before insert or update of item_id on public.listings
  for each row execute function public.listings_require_sale_item();

-- ---------------------------------------------------------------- buyer conversations

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  owner_id uuid not null default auth.uid(),
  buyer_label text not null,               -- display name as the channel shows it
  source text not null check (source in ('in_app', 'manual_entry', 'muse')),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (listing_id, owner_id) references public.listings (id, owner_id) on delete cascade
);
create index conversations_listing_idx on public.conversations (listing_id);
create index conversations_owner_idx on public.conversations (owner_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  owner_id uuid not null default auth.uid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  source text not null check (source in ('in_app', 'manual_entry', 'muse', 'app_reply')),
  action_id uuid,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id) references public.conversations (id, owner_id) on delete cascade
);
create index messages_conversation_idx on public.messages (conversation_id);
create index messages_owner_idx on public.messages (owner_id);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  conversation_id uuid not null,
  owner_id uuid not null default auth.uid(),
  status text not null default 'held' check (status in ('held', 'confirmed', 'released', 'completed')),
  price_cents integer check (price_cents >= 0),
  pickup_start timestamptz,
  pickup_end timestamptz,
  created_at timestamptz not null default now(),
  foreign key (item_id, owner_id) references public.items (id, owner_id) on delete cascade,
  foreign key (conversation_id, owner_id) references public.conversations (id, owner_id) on delete cascade,
  check (pickup_end is null or pickup_start is null or pickup_end > pickup_start)
);
-- At most one active reservation per item, whatever the number of buyers.
create unique index reservations_one_active_per_item
  on public.reservations (item_id) where status in ('held', 'confirmed');
create index reservations_owner_idx on public.reservations (owner_id);
create index reservations_conversation_idx on public.reservations (conversation_id);

-- ---------------------------------------------------------------- reviewed actions

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  kind text not null check (kind in (
    'gmail.send', 'calendar.create', 'listing.publish', 'buyer.reply', 'pickup.confirm'
  )),
  title text not null,
  payload jsonb not null,
  -- Set by trigger only: jsonb text output is canonical (sorted keys, normalized
  -- spacing), so this is a stable fingerprint of exactly what the renter reviewed.
  payload_hash text not null default '',
  status text not null default 'pending_review' check (status in (
    'pending_review', 'approved', 'executing', 'succeeded', 'failed', 'unknown', 'cancelled'
  )),
  approved_hash text,
  approved_at timestamptz,
  idempotency_key uuid not null default gen_random_uuid() unique,
  attempts integer not null default 0,
  execution_mode text check (execution_mode in ('live', 'manual_handoff', 'simulated')),
  provider_ref text,
  provider_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz,
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade
);
create index actions_move_idx on public.actions (move_id);
create index actions_owner_idx on public.actions (owner_id);
create trigger actions_touch before update on public.actions
  for each row execute function public.touch_updated_at();

-- Editing a payload voids its approval; executed payloads are immutable.
create or replace function public.actions_guard_payload() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.payload is distinct from old.payload then
    if old.status not in ('pending_review', 'approved') then
      raise exception 'action % is % and can no longer be edited', old.id, old.status
        using errcode = 'check_violation';
    end if;
    new.status := 'pending_review';
    new.approved_hash := null;
    new.approved_at := null;
  end if;
  new.payload_hash := encode(sha256(convert_to(new.payload::text, 'UTF8')), 'hex');
  return new;
end $$;
create trigger actions_payload_guard before update on public.actions
  for each row execute function public.actions_guard_payload();

create or replace function public.actions_hash_on_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.payload_hash := encode(sha256(convert_to(new.payload::text, 'UTF8')), 'hex');
  new.status := 'pending_review';
  new.approved_hash := null;
  new.approved_at := null;
  new.attempts := 0;
  new.provider_ref := null;
  new.provider_url := null;
  new.execution_mode := null;
  return new;
end $$;
create trigger actions_hash_insert before insert on public.actions
  for each row execute function public.actions_hash_on_insert();

create table public.action_events (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.actions (id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  event text not null,
  detail jsonb,
  at timestamptz not null default now()
);
create index action_events_action_idx on public.action_events (action_id);
create index action_events_owner_idx on public.action_events (owner_id);

-- Approve exactly the payload version the renter saw.
create or replace function public.approve_action(p_action_id uuid, p_payload_hash text)
returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  update public.actions
     set status = 'approved', approved_hash = p_payload_hash, approved_at = now()
   where id = p_action_id
     and owner_id = (select auth.uid())
     and status = 'pending_review'
     and payload_hash = p_payload_hash
  returning * into a;
  if a.id is null then
    raise exception 'action not found, not pending review, or changed since it was shown'
      using errcode = 'P0002';
  end if;
  insert into public.action_events (action_id, owner_id, event, detail)
    values (a.id, a.owner_id, 'approved', jsonb_build_object('payload_hash', p_payload_hash));
  return a;
end $$;

-- Atomically claim an approved action for one execution attempt. A second
-- concurrent call (double click, retry) gets no row and must not execute.
create or replace function public.claim_action(p_action_id uuid)
returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  update public.actions
     set status = 'executing', attempts = attempts + 1
   where id = p_action_id
     and owner_id = (select auth.uid())
     and status = 'approved'
     and approved_hash = payload_hash
  returning * into a;
  if a.id is not null then
    insert into public.action_events (action_id, owner_id, event)
      values (a.id, a.owner_id, 'claimed');
  end if;
  return a;
end $$;

-- Record the observed provider outcome for an action this user claimed.
create or replace function public.record_action_result(
  p_action_id uuid, p_status text, p_mode text,
  p_provider_ref text default null, p_provider_url text default null, p_error text default null
) returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  if p_status not in ('succeeded', 'failed', 'unknown') then
    raise exception 'invalid result status %', p_status using errcode = 'check_violation';
  end if;
  update public.actions
     set status = p_status, execution_mode = p_mode, provider_ref = p_provider_ref,
         provider_url = p_provider_url, error = p_error,
         executed_at = case when p_status = 'succeeded' then now() else executed_at end
   where id = p_action_id
     and owner_id = (select auth.uid())
     and status in ('executing', 'unknown')
  returning * into a;
  if a.id is null then
    raise exception 'action is not executing' using errcode = 'P0002';
  end if;
  insert into public.action_events (action_id, owner_id, event, detail)
    values (a.id, a.owner_id, p_status,
            jsonb_build_object('mode', p_mode, 'ref', p_provider_ref, 'error', p_error));
  return a;
end $$;

-- After reconciliation shows an "unknown" action did not happen, allow a retry.
create or replace function public.reopen_unknown_action(p_action_id uuid)
returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  update public.actions set status = 'approved'
   where id = p_action_id and owner_id = (select auth.uid()) and status = 'unknown'
  returning * into a;
  if a.id is not null then
    insert into public.action_events (action_id, owner_id, event)
      values (a.id, a.owner_id, 'reconciled_not_performed');
  end if;
  return a;
end $$;

revoke all on function public.approve_action(uuid, text) from public, anon;
revoke all on function public.claim_action(uuid) from public, anon;
revoke all on function public.record_action_result(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.reopen_unknown_action(uuid) from public, anon;
grant execute on function public.approve_action(uuid, text) to authenticated;
grant execute on function public.claim_action(uuid) to authenticated;
grant execute on function public.record_action_result(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.reopen_unknown_action(uuid) to authenticated;

-- ---------------------------------------------------------------- chat

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now(),
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade
);
create index chat_messages_move_idx on public.chat_messages (move_id, created_at);
create index chat_messages_owner_idx on public.chat_messages (owner_id);

-- ---------------------------------------------------------------- RLS

do $$
declare t text;
begin
  foreach t in array array[
    'moves', 'documents', 'lease_findings', 'tasks', 'items', 'item_photos', 'listings',
    'conversations', 'messages', 'reservations', 'actions', 'action_events', 'chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;

-- Action state changes only through the functions above; owners may still
-- create actions, edit payloads (which voids approval) and cancel.
revoke update on public.actions from authenticated;
grant update (payload, title) on public.actions to authenticated;
revoke insert, update, delete on public.action_events from authenticated;

create or replace function public.cancel_action(p_action_id uuid)
returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  update public.actions set status = 'cancelled'
   where id = p_action_id and owner_id = (select auth.uid())
     and status in ('pending_review', 'approved')
  returning * into a;
  if a.id is not null then
    insert into public.action_events (action_id, owner_id, event) values (a.id, a.owner_id, 'cancelled');
  end if;
  return a;
end $$;
revoke all on function public.cancel_action(uuid) from public, anon;
grant execute on function public.cancel_action(uuid) to authenticated;

-- ---------------------------------------------------------------- provider credentials

-- Not exposed through the Data API; only server code holding the secret key reads it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.google_credentials (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  scopes text[] not null,
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);
grant usage on schema private to service_role;
grant select, insert, update, delete on private.google_credentials to service_role;

-- Owners can see whether Google is connected without seeing tokens.
create or replace function public.google_connection_status()
returns table (connected boolean, google_email text, scopes text[])
language sql security definer set search_path = '' stable as $$
  select true, g.google_email, g.scopes from private.google_credentials g
   where g.owner_id = (select auth.uid())
$$;
revoke all on function public.google_connection_status() from public, anon;
grant execute on function public.google_connection_status() to authenticated;

-- ---------------------------------------------------------------- private storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('move-files', 'move-files', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

-- Object names are "<owner uuid>/<move uuid>/<file uuid>".
create policy move_files_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'move-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy move_files_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'move-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy move_files_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'move-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Credential access for server code holding the secret key. The caller passes
-- the owner id it obtained from the user's verified session.
create or replace function public.save_google_credentials(
  p_owner_id uuid, p_email text, p_scopes text[], p_refresh_token text,
  p_access_token text, p_expires_at timestamptz
) returns void
language sql security definer set search_path = '' as $$
  insert into private.google_credentials as g
    (owner_id, google_email, scopes, refresh_token, access_token, access_token_expires_at)
  values (p_owner_id, p_email, p_scopes, p_refresh_token, p_access_token, p_expires_at)
  on conflict (owner_id) do update set
    google_email = excluded.google_email,
    scopes = excluded.scopes,
    refresh_token = coalesce(excluded.refresh_token, g.refresh_token),
    access_token = excluded.access_token,
    access_token_expires_at = excluded.access_token_expires_at,
    connected_at = now()
$$;

create or replace function public.get_google_credentials(p_owner_id uuid)
returns table (google_email text, scopes text[], refresh_token text,
               access_token text, access_token_expires_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select google_email, scopes, refresh_token, access_token, access_token_expires_at
    from private.google_credentials where owner_id = p_owner_id
$$;

revoke all on function public.save_google_credentials(uuid, text, text[], text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_google_credentials(uuid) from public, anon, authenticated;
grant execute on function public.save_google_credentials(uuid, text, text[], text, text, timestamptz)
  to service_role;
grant execute on function public.get_google_credentials(uuid) to service_role;
