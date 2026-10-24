-- Muse bridge: lets the renter's own Muse agent (which holds their Facebook
-- account) pick up listings and messages the renter already approved here,
-- perform them under Muse's own permission prompts, and report results back.
--
-- Muse calls in with a per-user connector token, not a Supabase session, so
-- the server resolves the token to an owner and every function below scopes
-- itself to that owner. These functions are granted to service_role only.

-- "delegated": performed by another agent (Muse) on the renter's account and
-- reported back by it; not independently verified by this app.
alter table public.listings drop constraint listings_mode_check;
alter table public.listings add constraint listings_mode_check
  check (mode in ('live', 'manual_handoff', 'simulated', 'delegated'));
alter table public.actions drop constraint actions_execution_mode_check;
alter table public.actions add constraint actions_execution_mode_check
  check (execution_mode in ('live', 'manual_handoff', 'simulated', 'delegated'));

alter table public.listings add column delegate text check (delegate in ('muse'));
alter table public.conversations add column external_thread_ref text;
create unique index conversations_external_thread_idx
  on public.conversations (listing_id, external_thread_ref) where external_thread_ref is not null;

-- ---------------------------------------------------------------- connector tokens

create table public.connector_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default 'Muse',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null,                -- last 4 characters, for display
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index connector_tokens_owner_idx on public.connector_tokens (owner_id);
alter table public.connector_tokens enable row level security;
create policy connector_tokens_owner_read on public.connector_tokens for select to authenticated
  using (owner_id = (select auth.uid()));
create policy connector_tokens_owner_insert on public.connector_tokens for insert to authenticated
  with check (owner_id = (select auth.uid()));
revoke update, delete on public.connector_tokens from authenticated;
grant update (revoked_at) on public.connector_tokens to authenticated;
create policy connector_tokens_owner_revoke on public.connector_tokens for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create or replace function public.resolve_connector_token(p_token_hash text)
returns uuid
language sql security definer set search_path = '' as $$
  update public.connector_tokens
     set last_used_at = now()
   where token_hash = p_token_hash and revoked_at is null
  returning owner_id
$$;

-- ---------------------------------------------------------------- A2A task store

create table public.a2a_tasks (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  action_id uuid references public.actions (id) on delete set null,
  task jsonb not null,
  updated_at timestamptz not null default now()
);
create index a2a_tasks_owner_idx on public.a2a_tasks (owner_id);
create index a2a_tasks_action_idx on public.a2a_tasks (action_id);
alter table public.a2a_tasks enable row level security;
create policy a2a_tasks_owner_read on public.a2a_tasks for select to authenticated
  using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.a2a_tasks from authenticated;

create or replace function public.a2a_task_save(p_owner_id uuid, p_id text, p_task jsonb, p_action_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_action_id is not null and not exists (
    select 1 from public.actions where id = p_action_id and owner_id = p_owner_id
  ) then
    raise exception 'action not found' using errcode = 'P0002';
  end if;
  insert into public.a2a_tasks (id, owner_id, action_id, task)
  values (p_id, p_owner_id, p_action_id, p_task)
  on conflict (id) do update
    set task = excluded.task,
        action_id = coalesce(excluded.action_id, public.a2a_tasks.action_id),
        updated_at = now()
    where public.a2a_tasks.owner_id = p_owner_id;
end $$;

create or replace function public.a2a_task_load(p_owner_id uuid, p_id text)
returns jsonb
language sql security definer set search_path = '' stable as $$
  select task from public.a2a_tasks where id = p_id and owner_id = p_owner_id
$$;

-- ---------------------------------------------------------------- work queue

-- Reviewed work Muse may perform: approved (not yet claimed) and claimed
-- (executing/unknown) actions on the Facebook channel.
create or replace function public.muse_queue(p_owner_id uuid)
returns table (
  action_id uuid, kind text, title text, status text, payload jsonb,
  payload_hash text, approved_at timestamptz, attempts integer, photo_paths text[]
)
language sql security definer set search_path = '' stable as $$
  select a.id, a.kind, a.title, a.status, a.payload, a.payload_hash, a.approved_at, a.attempts,
         coalesce((
           select array_agg(d.storage_path order by d.uploaded_at)
             from public.listings l
             join public.item_photos ip on ip.item_id = l.item_id
             join public.documents d on d.id = ip.document_id
            where a.kind = 'listing.publish' and l.id = (a.payload ->> 'listingId')::uuid
              and l.owner_id = p_owner_id
         ), '{}')
    from public.actions a
   where a.owner_id = p_owner_id
     and a.status in ('approved', 'executing', 'unknown')
     and a.approved_hash = a.payload_hash
     and (
       (a.kind = 'listing.publish' and a.payload ->> 'channel' = 'facebook_marketplace')
       or (a.kind in ('buyer.reply', 'pickup.confirm') and exists (
         select 1 from public.conversations c
          where c.id = (a.payload ->> 'conversationId')::uuid
            and c.owner_id = p_owner_id and c.source = 'muse'))
     )
   order by a.approved_at
$$;

-- Claim one approved action for Muse. Exactly-once: a second claim gets null.
-- A pickup claim also holds the item; a second buyer cannot get a hold.
create or replace function public.muse_claim(p_owner_id uuid, p_action_id uuid, p_payload_hash text)
returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  update public.actions
     set status = 'executing', attempts = attempts + 1
   where id = p_action_id and owner_id = p_owner_id
     and status = 'approved' and approved_hash = payload_hash
     and payload_hash = p_payload_hash
  returning * into a;
  if a.id is null then
    return null;
  end if;
  if a.kind = 'pickup.confirm' then
    insert into public.reservations (item_id, conversation_id, owner_id, status, price_cents,
                                     pickup_start, pickup_end)
    values ((a.payload ->> 'itemId')::uuid, (a.payload ->> 'conversationId')::uuid, p_owner_id,
            'held', (a.payload ->> 'priceCents')::integer,
            (a.payload ->> 'pickupStart')::timestamptz, (a.payload ->> 'pickupEnd')::timestamptz);
  end if;
  insert into public.action_events (action_id, owner_id, event, detail)
    values (a.id, p_owner_id, 'claimed', jsonb_build_object('by', 'muse'));
  return a;
end $$;

-- Record what Muse reports. Only a claimed action with the same payload hash
-- can be completed, so Muse cannot report a different version than approved.
create or replace function public.muse_report(
  p_owner_id uuid, p_action_id uuid, p_payload_hash text, p_status text,
  p_external_url text default null, p_external_ref text default null, p_note text default null
) returns public.actions
language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  if p_status not in ('succeeded', 'failed', 'unknown') then
    raise exception 'status must be succeeded, failed or unknown' using errcode = 'check_violation';
  end if;
  update public.actions
     set status = p_status, execution_mode = 'delegated',
         provider_ref = coalesce(p_external_ref, provider_ref),
         provider_url = coalesce(p_external_url, provider_url),
         error = case when p_status = 'succeeded' then null else p_note end,
         executed_at = case when p_status = 'succeeded' then now() else executed_at end
   where id = p_action_id and owner_id = p_owner_id
     and status in ('executing', 'unknown') and payload_hash = p_payload_hash
  returning * into a;
  if a.id is null then
    raise exception 'action is not claimed, or the payload differs from the approved version'
      using errcode = 'P0002';
  end if;

  if a.kind = 'listing.publish' then
    update public.listings
       set status = case p_status when 'succeeded' then 'published'
                                  when 'failed' then 'failed' else status end,
           mode = 'delegated', delegate = 'muse',
           external_url = coalesce(p_external_url, external_url),
           external_ref = coalesce(p_external_ref, external_ref),
           published_at = case when p_status = 'succeeded' then now() else published_at end
     where id = (a.payload ->> 'listingId')::uuid and owner_id = p_owner_id;
    if p_status = 'succeeded' then
      update public.items i set status = 'listed'
        from public.listings l
       where l.id = (a.payload ->> 'listingId')::uuid and i.id = l.item_id
         and i.owner_id = p_owner_id and i.status = 'inventory';
    end if;
  elsif a.kind in ('buyer.reply', 'pickup.confirm') and p_status = 'succeeded' then
    insert into public.messages (conversation_id, owner_id, direction, body, source, action_id)
    values ((a.payload ->> 'conversationId')::uuid, p_owner_id, 'outbound',
            coalesce(a.payload ->> 'body', a.payload ->> 'message'), 'muse', a.id);
    if a.kind = 'pickup.confirm' then
      update public.reservations set status = 'confirmed'
       where conversation_id = (a.payload ->> 'conversationId')::uuid
         and item_id = (a.payload ->> 'itemId')::uuid
         and owner_id = p_owner_id and status = 'held';
      update public.items set status = 'reserved'
       where id = (a.payload ->> 'itemId')::uuid and owner_id = p_owner_id;
    end if;
  elsif a.kind = 'pickup.confirm' and p_status = 'failed' then
    update public.reservations set status = 'released'
     where conversation_id = (a.payload ->> 'conversationId')::uuid
       and owner_id = p_owner_id and status = 'held';
  end if;

  insert into public.action_events (action_id, owner_id, event, detail)
    values (a.id, p_owner_id, p_status,
            jsonb_build_object('by', 'muse', 'url', p_external_url, 'ref', p_external_ref, 'note', p_note));
  return a;
end $$;

-- Muse relays a buyer's message for a listing it published. The text is
-- untrusted buyer content; it creates no commitments by itself.
create or replace function public.muse_buyer_message(
  p_owner_id uuid, p_listing_id uuid, p_buyer_label text, p_body text, p_thread_ref text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare conv uuid;
begin
  if not exists (
    select 1 from public.listings where id = p_listing_id and owner_id = p_owner_id
  ) then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;
  select id into conv from public.conversations
   where listing_id = p_listing_id and owner_id = p_owner_id
     and external_thread_ref = p_thread_ref;
  if conv is null then
    insert into public.conversations (listing_id, owner_id, buyer_label, source, external_thread_ref)
    values (p_listing_id, p_owner_id, left(p_buyer_label, 100), 'muse', p_thread_ref)
    returning id into conv;
  end if;
  insert into public.messages (conversation_id, owner_id, direction, body, source)
  values (conv, p_owner_id, 'inbound', left(p_body, 4000), 'muse');
  return conv;
end $$;

-- Listings the owner has published through Muse, for message relay.
create or replace function public.muse_listings(p_owner_id uuid)
returns table (listing_id uuid, title text, status text, external_url text, item_status text)
language sql security definer set search_path = '' stable as $$
  select l.id, l.title, l.status, l.external_url, i.status
    from public.listings l join public.items i on i.id = l.item_id
   where l.owner_id = p_owner_id and l.channel = 'facebook_marketplace'
   order by l.created_at desc
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'resolve_connector_token(text)',
    'a2a_task_save(uuid, text, jsonb, uuid)',
    'a2a_task_load(uuid, text)',
    'muse_queue(uuid)',
    'muse_claim(uuid, uuid, text)',
    'muse_report(uuid, uuid, text, text, text, text, text)',
    'muse_buyer_message(uuid, uuid, text, text, text)',
    'muse_listings(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
