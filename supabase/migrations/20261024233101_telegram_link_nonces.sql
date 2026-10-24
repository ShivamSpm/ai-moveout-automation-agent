-- Short-lived linking credentials; only the server can create, bind or consume.
create table public.telegram_link_nonces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  nonce text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  telegram_user_id text,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table public.telegram_link_nonces enable row level security;
revoke all on public.telegram_link_nonces from anon, authenticated;
grant select on public.telegram_link_nonces to authenticated;
grant all on public.telegram_link_nonces to service_role;
create policy telegram_link_nonces_owner_read on public.telegram_link_nonces
  for select to authenticated using (owner_id = (select auth.uid()));
alter table public.telegram_targets add column telegram_user_id text;

-- Row locking makes simultaneous polling reuse the same unexpired credential.
create function public.prepare_telegram_link(p_owner_id uuid)
returns public.telegram_link_nonces language sql security invoker set search_path = '' as $$
  insert into public.telegram_link_nonces as n (owner_id) values (p_owner_id)
  on conflict (owner_id) do update set
    nonce = case when n.expires_at <= now() then encode(extensions.gen_random_bytes(24), 'hex') else n.nonce end,
    telegram_user_id = case when n.expires_at <= now() then null else n.telegram_user_id end,
    expires_at = case when n.expires_at <= now() then now() + interval '15 minutes' else n.expires_at end
  returning n.*;
$$;

-- Capture the Telegram sender in the private start step. Never rebind a nonce.
create function public.bind_telegram_link(p_nonce text, p_user_id text)
returns boolean language sql security invoker set search_path = '' as $$
  with bound as (
    update public.telegram_link_nonces set telegram_user_id = p_user_id
    where nonce = p_nonce and expires_at > now() and telegram_user_id is null
      and p_user_id ~ '^[0-9]+$'
    returning owner_id
  ) select exists(select 1 from bound);
$$;

-- DELETE ... RETURNING is the single-use claim. Target write and consumption
-- commit together, so a failed write rolls the nonce back; competing calls lose.
create function public.consume_telegram_link(p_nonce text, p_user_id text, p_chat_id text, p_title text, p_username text)
returns boolean language sql security invoker set search_path = '' as $$
  with consumed as (
    delete from public.telegram_link_nonces
    where nonce = p_nonce and expires_at > now()
      and telegram_user_id = p_user_id and p_user_id is not null
    returning owner_id, telegram_user_id
  ), saved as (
    insert into public.telegram_targets (owner_id, chat_id, chat_title, chat_username, telegram_user_id)
    select owner_id, p_chat_id, p_title, p_username, telegram_user_id from consumed
    on conflict (owner_id) do update set chat_id = excluded.chat_id,
      chat_title = excluded.chat_title, chat_username = excluded.chat_username,
      telegram_user_id = excluded.telegram_user_id, linked_at = now()
    returning owner_id
  ) select exists(select 1 from saved);
$$;
revoke all on function public.prepare_telegram_link(uuid), public.bind_telegram_link(text,text), public.consume_telegram_link(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.prepare_telegram_link(uuid), public.bind_telegram_link(text,text), public.consume_telegram_link(text,text,text,text,text) to service_role;
