-- The cleaning company and moving company the renter picked on /services.
-- One saved choice per move and kind; picking again replaces it. The picks
-- come from the simulated marketplaces, so codes are SIM- confirmations.

create table public.service_selections (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  kind text not null check (kind in ('cleaning', 'moving')),
  provider_id text not null check (length(provider_id) between 1 and 100),
  provider_name text not null check (length(provider_name) between 1 and 200),
  total_usd numeric(10, 2) not null check (total_usd >= 0),
  slot_start timestamptz,
  confirmation_code text check (confirmation_code is null or confirmation_code ~ '^SIM-[A-Z0-9]+$'),
  simulated boolean not null default true,
  selected_at timestamptz not null default now(),
  unique (move_id, kind),
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade
);

create index service_selections_owner_idx on public.service_selections (owner_id);

alter table public.service_selections enable row level security;
create policy service_selections_owner on public.service_selections for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
