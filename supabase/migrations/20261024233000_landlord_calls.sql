-- Phone calls the agent places (through Bland) to the renter's own landlord to
-- confirm the move-out date and get the move-out checklist. Each row is one
-- call the renter approved on /calls; the checklist items it produced are also
-- saved as tasks with source_kind 'landlord'.

alter table public.tasks drop constraint tasks_source_kind_check;
alter table public.tasks add constraint tasks_source_kind_check
  check (source_kind in ('lease', 'general_info', 'plan', 'landlord'));

create table public.landlord_calls (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null,
  owner_id uuid not null default auth.uid(),
  to_phone text not null check (to_phone ~ '^\+[1-9][0-9]{7,14}$'),
  script text not null check (length(script) between 1 and 4000),
  provider_call_id text unique,
  status text not null default 'requested' check (status in (
    'requested', 'in_progress', 'completed', 'no_answer', 'voicemail', 'failed'
  )),
  summary text,
  transcript text,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  error text,
  price_usd numeric(8, 2),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (move_id, owner_id) references public.moves (id, owner_id) on delete cascade
);

create index landlord_calls_owner_idx on public.landlord_calls (owner_id, created_at desc);

alter table public.landlord_calls enable row level security;
create policy landlord_calls_owner on public.landlord_calls for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
