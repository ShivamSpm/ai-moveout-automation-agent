-- Catalog of FICTIONAL moving companies for the simulated moving marketplace.
-- No user data lives here. Anyone may read active rows; only service_role writes
-- (there are no insert, update or delete policies). The seed rows below mirror
-- web/src/server/integrations/moving-catalog-fixture.ts; a unit test fails if
-- they drift apart. Every CHECK mirrors the app's zod row schema, so a row the
-- database accepts is never skipped by the app.

create table public.moving_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  -- Origin ZIPs the company picks up from.
  service_zips text[] not null check (
    cardinality(service_zips) > 0
    and array_position(service_zips, null) is null
    and array_to_string(service_zips, ',') ~ '^[0-9]{5}(,[0-9]{5})*$'
  ),
  max_distance_miles integer not null check (max_distance_miles between 1 and 3000),

  hourly_rate_per_mover_usd numeric(8,2) not null check (hourly_rate_per_mover_usd >= 0),
  min_hours numeric(4,1) not null check (min_hours between 0 and 12),
  crew_sizes smallint[] not null check (
    cardinality(crew_sizes) > 0
    and array_position(crew_sizes, null) is null
    and crew_sizes <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
  ),
  truck_capacity_cuft integer not null check (truck_capacity_cuft between 100 and 3000),
  max_trucks smallint not null check (max_trucks between 1 and 4),
  truck_fee_usd numeric(8,2) not null check (truck_fee_usd >= 0),
  travel_fee_usd numeric(8,2) not null check (travel_fee_usd >= 0),

  packing_usd_per_box numeric(8,2) not null check (packing_usd_per_box >= 0),
  materials_usd_per_box numeric(8,2) not null check (materials_usd_per_box >= 0),
  unpacking_usd_per_box numeric(8,2) not null check (unpacking_usd_per_box >= 0),
  stairs_fee_per_flight_usd numeric(8,2) not null check (stairs_fee_per_flight_usd >= 0),
  long_carry_fee_per_50ft_usd numeric(8,2) not null check (long_carry_fee_per_50ft_usd >= 0),
  parking_permit_fee_usd numeric(8,2) not null check (parking_permit_fee_usd >= 0),
  disassembly_usd_per_item numeric(8,2) not null check (disassembly_usd_per_item >= 0),

  handles_piano boolean not null,
  piano_fee_usd numeric(8,2) not null check (piano_fee_usd >= 0),
  handles_safe boolean not null,
  safe_fee_usd numeric(8,2) not null check (safe_fee_usd >= 0),
  handles_pool_table boolean not null,
  pool_table_fee_usd numeric(8,2) not null check (pool_table_fee_usd >= 0),
  handles_artwork boolean not null,
  artwork_fee_usd numeric(8,2) not null check (artwork_fee_usd >= 0),
  handles_appliance boolean not null,
  appliance_fee_usd numeric(8,2) not null check (appliance_fee_usd >= 0),
  handles_aquarium boolean not null,
  aquarium_fee_usd numeric(8,2) not null check (aquarium_fee_usd >= 0),

  offers_packing boolean not null,
  offers_unpacking boolean not null,
  offers_disassembly boolean not null,
  offers_storage boolean not null,
  storage_usd_per_100cuft_month numeric(8,2) not null check (storage_usd_per_100cuft_month >= 0),

  -- Full-value protection costs max(full_value_min_usd, declared value * full_value_pct / 100).
  offers_full_value boolean not null,
  full_value_pct numeric(5,2) not null check (full_value_pct between 0 and 100),
  full_value_min_usd numeric(8,2) not null check (full_value_min_usd >= 0),

  rush_pct numeric(5,2) not null check (rush_pct between 0 and 100),
  rush_window_hours integer not null check (rush_window_hours >= 0),

  min_notice_hours integer not null check (min_notice_hours >= 0),
  works_weekdays smallint[] not null
    check (cardinality(works_weekdays) > 0 and works_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  day_start_hour smallint not null check (day_start_hour between 0 and 23),
  day_end_hour smallint not null check (day_end_hour between 1 and 24),
  max_jobs_per_day smallint not null check (max_jobs_per_day > 0),

  rating numeric(2,1) not null check (rating between 0 and 5),
  review_count integer not null check (review_count >= 0),
  cancellation_policy text not null check (length(cancellation_policy) between 1 and 500),
  deposit_pct numeric(5,2) not null check (deposit_pct between 0 and 100),
  notes text check (notes is null or length(notes) <= 500),

  is_simulated boolean not null default true check (is_simulated),
  active boolean not null default true,
  created_at timestamptz not null default now(),

  check (day_start_hour < day_end_hour)
);

comment on table public.moving_providers is
  'Simulated moving marketplace catalog. Every row is a fictional company: no real business, contact detail or address. Results built from it must be labeled simulated.';

create index moving_providers_service_zips_idx on public.moving_providers using gin (service_zips);

alter table public.moving_providers enable row level security;

create policy moving_providers_read_active on public.moving_providers
  for select to anon, authenticated
  using (active);

-- RLS already blocks writes without a policy; revoking every privilege first keeps it that way if a
-- write policy is added by mistake, and also removes truncate, which RLS does not cover.
revoke all on public.moving_providers from anon, authenticated;
grant select on public.moving_providers to anon, authenticated;

-- Fictional seed data (San Francisco and East Bay ZIPs only).
insert into public.moving_providers (
  id,
  slug,
  display_name,
  service_zips,
  max_distance_miles,
  hourly_rate_per_mover_usd,
  min_hours,
  crew_sizes,
  truck_capacity_cuft,
  max_trucks,
  truck_fee_usd,
  travel_fee_usd,
  packing_usd_per_box,
  materials_usd_per_box,
  unpacking_usd_per_box,
  stairs_fee_per_flight_usd,
  long_carry_fee_per_50ft_usd,
  parking_permit_fee_usd,
  disassembly_usd_per_item,
  handles_piano,
  piano_fee_usd,
  handles_safe,
  safe_fee_usd,
  handles_pool_table,
  pool_table_fee_usd,
  handles_artwork,
  artwork_fee_usd,
  handles_appliance,
  appliance_fee_usd,
  handles_aquarium,
  aquarium_fee_usd,
  offers_packing,
  offers_unpacking,
  offers_disassembly,
  offers_storage,
  storage_usd_per_100cuft_month,
  offers_full_value,
  full_value_pct,
  full_value_min_usd,
  rush_pct,
  rush_window_hours,
  min_notice_hours,
  works_weekdays,
  day_start_hour,
  day_end_hour,
  max_jobs_per_day,
  rating,
  review_count,
  cancellation_policy,
  deposit_pct,
  notes,
  active
) values
  ('a0e10000-0000-4000-8000-000000000001'::uuid, 'harborlight-moving', 'Harborlight Moving Co. (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 50, 55, 3, array[2,3,4]::smallint[], 900, 2, 150, 90, 6, 3.5, 3, 25, 30, 75, 25, true, 250, true, 150, false, 0, true, 40, true, 55, false, 0, true, true, true, true, 18, true, 1.5, 90, 20, 48, 48, array[1,2,3,4,5,6]::smallint[], 7, 19, 3, 4.6, 740, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, null, true),
  ('a0e10000-0000-4000-8000-000000000002'::uuid, 'fogbell-movers', 'Fogbell Movers (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 30, 42, 2, array[2,3]::smallint[], 800, 1, 120, 60, 0, 0, 0, 25, 30, 75, 20, false, 0, false, 0, false, 0, false, 0, true, 45, false, 0, false, false, true, false, 0, false, 0, 0, 20, 48, 24, array[0,1,2,3,4,5,6]::smallint[], 8, 18, 3, 4, 315, 'Free cancellation until 24 hours before the move; $75 after that.', 0, 'Local labor-only crews; no packing.', true),
  ('a0e10000-0000-4000-8000-000000000003'::uuid, 'lanternfish-moving', 'Lanternfish Moving (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134','94607','94609','94610','94611','94612','94618','94702','94703','94705']::text[], 3000, 65, 4, array[3,4,5]::smallint[], 1600, 2, 250, 150, 6, 3.5, 3, 25, 30, 75, 25, true, 300, true, 175, true, 275, true, 40, true, 55, true, 120, true, true, true, true, 22, true, 1.2, 120, 25, 72, 72, array[1,2,3,4,5]::smallint[], 6, 22, 2, 4.8, 1320, 'Free cancellation until 7 days before the move; half the deposit is kept after that.', 25, 'Long-distance and full-service moves.', true),
  ('a0e10000-0000-4000-8000-000000000004'::uuid, 'cobblestone-carry', 'Cobblestone Carry (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 25, 45, 2, array[2]::smallint[], 350, 1, 90, 40, 6, 3.5, 3, 25, 30, 75, 25, false, 0, false, 0, false, 0, true, 40, true, 55, false, 0, true, true, true, false, 0, false, 0, 0, 20, 48, 24, array[0,1,2,3,4,5,6]::smallint[], 8, 18, 3, 4.4, 96, 'Free cancellation until 24 hours before the move; $50 after that.', 0, 'One cargo van; studios and small one-bedrooms.', true),
  ('a0e10000-0000-4000-8000-000000000005'::uuid, 'bramblegate-moving', 'Bramblegate Moving (fictional)', array['94607','94609','94610','94611','94612','94618','94702','94703','94705']::text[], 50, 48, 2, array[2,3,4]::smallint[], 900, 1, 140, 80, 6, 3.5, 3, 25, 30, 75, 25, false, 0, false, 0, false, 0, true, 40, true, 55, false, 0, true, true, true, false, 0, true, 1.5, 90, 20, 48, 48, array[1,2,3,4,5,6]::smallint[], 8, 18, 3, 4.2, 188, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, 'East Bay pickups only.', true),
  ('a0e10000-0000-4000-8000-000000000006'::uuid, 'thimbleberry-moving', 'Thimbleberry Moving (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 50, 47, 2, array[2,3,4]::smallint[], 900, 1, 140, 80, 6, 3.5, 3, 25, 30, 75, 25, false, 0, false, 0, false, 0, true, 40, true, 55, false, 0, true, true, true, false, 0, true, 1.5, 90, 20, 48, 24, array[0,6]::smallint[], 8, 18, 3, 4.1, 77, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, 'Weekend moves only.', true),
  ('a0e10000-0000-4000-8000-000000000007'::uuid, 'copperfox-movers', 'Copperfox Movers (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 50, 70, 4, array[2,3,4]::smallint[], 900, 2, 200, 120, 6, 3.5, 3, 25, 30, 75, 25, true, 275, true, 160, false, 0, true, 40, true, 55, true, 110, true, true, true, true, 25, true, 1.5, 90, 20, 48, 336, array[1,2,3,4,5,6]::smallint[], 8, 18, 2, 4.9, 860, 'Free cancellation until 14 days before the move; the deposit is kept after that.', 20, 'White-glove crews booked two weeks ahead.', true),
  ('a0e10000-0000-4000-8000-000000000008'::uuid, 'kelpline-movers', 'Kelpline Movers (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 100, 58, 2, array[3,4]::smallint[], 900, 1, 140, 80, 6, 3.5, 0, 25, 30, 75, 25, true, 200, true, 140, true, 240, true, 40, true, 55, false, 0, true, false, true, false, 0, true, 1.5, 90, 20, 48, 24, array[1,2,3,4,5,6]::smallint[], 8, 18, 3, 4.5, 402, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, 'Piano, safe and pool table specialists.', true),
  ('a0e10000-0000-4000-8000-000000000009'::uuid, 'wickerbasket-relocation', 'Wickerbasket Relocation (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 60, 52, 2, array[2,3,4]::smallint[], 900, 1, 140, 80, 5, 3.5, 2.5, 25, 30, 75, 0, false, 0, false, 0, false, 0, true, 40, true, 55, false, 0, true, true, false, true, 15, false, 0, 0, 20, 48, 24, array[1,2,3,4,5]::smallint[], 8, 18, 3, 4.2, 233, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, 'Packing-first service; no furniture disassembly.', true),
  ('a0e10000-0000-4000-8000-000000000010'::uuid, 'bluegill-moving', 'Bluegill Moving (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 40, 38, 2, array[2,3]::smallint[], 1000, 1, 100, 50, 6, 3.5, 3, 25, 30, 75, 25, false, 0, false, 0, false, 0, true, 40, true, 55, true, 90, true, true, true, false, 0, false, 0, 0, 20, 48, 24, array[0,1,2,3,4,5,6]::smallint[], 8, 18, 4, 3.8, 145, 'Free cancellation until 48 hours before the move; $60 after that.', 0, 'Budget crews.', true),
  ('a0e10000-0000-4000-8000-000000000011'::uuid, 'marigold-lift-movers', 'Marigold Lift Movers (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134','94607','94609','94610','94611','94612','94618','94702','94703','94705']::text[], 400, 60, 2, array[2,3,4]::smallint[], 900, 2, 180, 100, 6, 3.5, 3, 25, 30, 75, 25, true, 260, true, 150, false, 0, true, 40, true, 55, true, 100, true, true, true, true, 20, true, 1.5, 90, 20, 72, 48, array[0,1,2,3,4,5,6]::smallint[], 7, 20, 3, 4.5, 610, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 15, null, true),
  ('a0e10000-0000-4000-8000-000000000012'::uuid, 'pinecone-relocation', 'Pinecone Relocation (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 120, 53, 2, array[2,3,4]::smallint[], 900, 2, 140, 80, 6, 3.5, 3, 25, 30, 75, 25, false, 0, true, 130, false, 0, false, 0, true, 55, false, 0, true, true, true, true, 16, true, 1.8, 80, 20, 48, 24, array[1,2,3,4,5,6]::smallint[], 8, 18, 3, 4.3, 276, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, null, true),
  ('a0e10000-0000-4000-8000-000000000013'::uuid, 'tumbleweed-carry', 'Tumbleweed Carry (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 50, 50, 2, array[2,3,4]::smallint[], 900, 1, 140, 80, 6, 3.5, 3, 25, 30, 75, 25, false, 0, false, 0, false, 0, true, 40, true, 55, false, 0, true, true, true, false, 0, true, 1.5, 90, 20, 48, 24, array[1,2,3,4,5,6]::smallint[], 8, 18, 3, 3.6, 41, 'Free cancellation until 72 hours before the move; the deposit is kept after that.', 10, 'Paused: not taking new moves.', false);
