-- Catalog of FICTIONAL cleaning companies for the simulated cleaning marketplace.
-- No user data lives here. Anyone may read active rows; only service_role writes
-- (there are no insert, update or delete policies). The seed rows below mirror
-- web/src/server/integrations/cleaning-catalog-fixture.ts; a unit test fails if
-- they drift apart.

create table public.cleaning_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  -- Same rules as the app's zod row schema, so a row the database accepts is never skipped by the app.
  service_zips text[] not null check (
    cardinality(service_zips) > 0
    and array_position(service_zips, null) is null
    and array_to_string(service_zips, ',') ~ '^[0-9]{5}(,[0-9]{5})*$'
  ),

  base_usd numeric(8,2) not null check (base_usd >= 0),
  per_bedroom_usd numeric(8,2) not null check (per_bedroom_usd >= 0),
  per_bathroom_usd numeric(8,2) not null check (per_bathroom_usd >= 0),

  deep_clean_usd numeric(8,2) not null check (deep_clean_usd >= 0),
  carpet_usd_per_room numeric(8,2) not null check (carpet_usd_per_room >= 0),
  inside_appliances_usd numeric(8,2) not null check (inside_appliances_usd >= 0),
  windows_usd numeric(8,2) not null check (windows_usd >= 0),
  walls_usd numeric(8,2) not null check (walls_usd >= 0),

  pet_surcharge_usd numeric(8,2) not null check (pet_surcharge_usd >= 0),
  no_elevator_surcharge_usd numeric(8,2) not null check (no_elevator_surcharge_usd >= 0),
  bulky_items_surcharge_usd numeric(8,2) not null check (bulky_items_surcharge_usd >= 0),
  rush_pct numeric(5,2) not null check (rush_pct between 0 and 100),
  rush_window_hours integer not null check (rush_window_hours >= 0),

  offers_carpet boolean not null,
  offers_inside_appliances boolean not null,
  offers_windows boolean not null,
  offers_walls boolean not null,
  accepts_pets boolean not null,

  min_notice_hours integer not null check (min_notice_hours >= 0),
  works_weekdays smallint[] not null
    check (cardinality(works_weekdays) > 0 and works_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  day_start_hour smallint not null check (day_start_hour between 0 and 23),
  day_end_hour smallint not null check (day_end_hour between 1 and 24),
  max_jobs_per_day smallint not null check (max_jobs_per_day > 0),

  rating numeric(2,1) not null check (rating between 0 and 5),
  review_count integer not null check (review_count >= 0),
  cancellation_policy text not null check (length(cancellation_policy) between 1 and 500),
  notes text check (notes is null or length(notes) <= 500),

  is_simulated boolean not null default true check (is_simulated),
  active boolean not null default true,
  created_at timestamptz not null default now(),

  check (day_start_hour < day_end_hour)
);

comment on table public.cleaning_providers is
  'Simulated cleaning marketplace catalog. Every row is a fictional company: no real business, contact detail or address. Results built from it must be labeled simulated.';

create index cleaning_providers_service_zips_idx on public.cleaning_providers using gin (service_zips);

alter table public.cleaning_providers enable row level security;

create policy cleaning_providers_read_active on public.cleaning_providers
  for select to anon, authenticated
  using (active);

-- RLS already blocks writes without a policy; revoking every privilege first keeps it that way if a
-- write policy is added by mistake, and also removes truncate, which RLS does not cover.
revoke all on public.cleaning_providers from anon, authenticated;
grant select on public.cleaning_providers to anon, authenticated;

-- Fictional seed data (San Francisco ZIPs only).
insert into public.cleaning_providers (
  id, slug, display_name, service_zips, base_usd, per_bedroom_usd, per_bathroom_usd, deep_clean_usd, carpet_usd_per_room, inside_appliances_usd, windows_usd, walls_usd, pet_surcharge_usd, no_elevator_surcharge_usd, bulky_items_surcharge_usd, rush_pct, rush_window_hours, offers_carpet, offers_inside_appliances, offers_windows, offers_walls, accepts_pets, min_notice_hours, works_weekdays, day_start_hour, day_end_hour, max_jobs_per_day, rating, review_count, cancellation_policy, notes, active
) values
  ('c1ea0000-0000-4000-8000-000000000001'::uuid, 'quillfeather-home-care', 'Quillfeather Home Care (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 95, 35, 25, 70, 40, 60, 45, 70, 30, 25, 60, 25, 72, true, true, true, true, true, 48, array[1,2,3,4,5]::smallint[], 8, 18, 3, 4.4, 312, 'Free cancellation until 48 hours before the slot; $50 after that.', null, true),
  ('c1ea0000-0000-4000-8000-000000000002'::uuid, 'otterbay-shine', 'Otterbay Shine (fictional)', array['94103','94107','94110','94112','94114','94124','94131','94134']::text[], 70, 25, 20, 50, 0, 45, 30, 0, 20, 20, 45, 20, 48, false, true, true, false, true, 24, array[1,2,3,4,5,6]::smallint[], 9, 17, 2, 3.7, 88, 'Free cancellation until 24 hours before the slot; $30 after that.', 'Budget crew; no carpet or wall work.', true),
  ('c1ea0000-0000-4000-8000-000000000003'::uuid, 'brassbell-cleaners', 'Brassbell Cleaners (fictional)', array['94102','94104','94105','94108','94109','94111','94115','94123','94133']::text[], 140, 50, 40, 95, 55, 80, 60, 90, 45, 40, 90, 30, 72, true, true, true, true, true, 24, array[0,1,2,3,4,5,6]::smallint[], 8, 20, 4, 4.7, 905, 'Free cancellation until 72 hours before the slot; $100 after that.', null, true),
  ('c1ea0000-0000-4000-8000-000000000004'::uuid, 'kitefield-cleaning', 'Kitefield Cleaning (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 105, 38, 28, 75, 42, 65, 50, 75, 0, 30, 70, 25, 72, true, true, true, true, false, 24, array[0,1,2,3,4,5,6]::smallint[], 8, 20, 4, 4.6, 540, 'Free cancellation until 24 hours before the slot; $40 after that.', 'Allergy-safe crews; no homes with pets.', true),
  ('c1ea0000-0000-4000-8000-000000000005'::uuid, 'saltmarsh-sweep', 'Saltmarsh Sweep Co. (fictional)', array['94116','94117','94118','94121','94122','94127','94132']::text[], 85, 30, 25, 60, 35, 55, 40, 60, 25, 20, 50, 20, 48, true, true, true, true, true, 24, array[0,6]::smallint[], 9, 17, 2, 4, 61, 'Free cancellation until 24 hours before the slot; $25 after that.', null, true),
  ('c1ea0000-0000-4000-8000-000000000006'::uuid, 'copperkettle-cleaning', 'Copperkettle Cleaning (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94123','94124','94131','94133','94134']::text[], 150, 55, 45, 100, 60, 85, 65, 95, 40, 35, 95, 35, 96, true, true, true, true, true, 72, array[2,3,4,5,6]::smallint[], 8, 18, 3, 4.9, 1210, 'Free cancellation until 72 hours before the slot; $120 after that.', 'Move-out specialists; receipts itemized for deposit disputes.', true),
  ('c1ea0000-0000-4000-8000-000000000007'::uuid, 'hollowreed-home-services', 'Hollowreed Home Services (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 75, 28, 22, 55, 35, 50, 35, 55, 25, 20, 50, 20, 48, true, true, true, true, true, 24, array[0,6]::smallint[], 8, 18, 3, 4.2, 143, 'Free cancellation until 12 hours before the slot; $25 after that.', 'Weekends only.', true),
  ('c1ea0000-0000-4000-8000-000000000008'::uuid, 'bluefinch-cleaning-collective', 'Bluefinch Cleaning Collective (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 90, 32, 24, 65, 38, 0, 0, 65, 30, 25, 55, 25, 72, true, false, false, true, true, 24, array[1,2,3,4,5]::smallint[], 9, 18, 2, 4.1, 206, 'Free cancellation until 24 hours before the slot; $35 after that.', null, true),
  ('c1ea0000-0000-4000-8000-000000000009'::uuid, 'wrenmoor-move-out-crew', 'Wrenmoor Move-Out Crew (fictional)', array['94103','94107','94110','94112','94114','94124','94131','94134']::text[], 100, 36, 26, 70, 40, 60, 45, 70, 30, 25, 60, 25, 72, true, true, true, true, true, 336, array[1,2,3,4,5]::smallint[], 8, 18, 2, 4.5, 390, 'Free cancellation until 7 days before the slot; $80 after that.', 'Books two weeks ahead.', true),
  ('c1ea0000-0000-4000-8000-000000000010'::uuid, 'tallowpine-cleaners', 'Tallowpine Cleaners (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 65, 22, 18, 45, 0, 40, 25, 45, 0, 15, 40, 15, 48, false, true, true, true, false, 24, array[1,2,3,4,5,6]::smallint[], 9, 17, 1, 3.5, 47, 'Free cancellation until 24 hours before the slot; $20 after that.', 'Solo cleaner; one job a day.', true),
  ('c1ea0000-0000-4000-8000-000000000011'::uuid, 'fennelgrove-housekeeping', 'Fennelgrove Housekeeping (fictional)', array['94103','94107','94110','94112','94114','94116','94117','94118','94121','94122','94124','94127','94131','94132','94134']::text[], 115, 42, 32, 80, 45, 70, 55, 80, 35, 30, 75, 30, 72, true, true, true, true, true, 48, array[1,2,3,4,5]::smallint[], 7, 15, 2, 4.3, 275, 'Free cancellation until 48 hours before the slot; $60 after that.', null, true),
  ('c1ea0000-0000-4000-8000-000000000012'::uuid, 'juniper-fog-cleaning', 'Juniper Fog Cleaning Co. (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 110, 40, 30, 75, 45, 65, 50, 0, 30, 30, 65, 35, 72, true, true, true, false, true, 24, array[1,2,3,4,5,6]::smallint[], 8, 18, 3, 4.4, 498, 'Free cancellation until 24 hours before the slot; $45 after that.', 'Plant-based products; no wall washing.', true),
  ('c1ea0000-0000-4000-8000-000000000013'::uuid, 'mistral-hill-housekeeping', 'Mistral Hill Housekeeping (fictional)', array['94102','94104','94105','94108','94109','94111','94115','94123','94133']::text[], 125, 45, 35, 85, 50, 75, 55, 85, 40, 35, 80, 30, 72, true, true, true, true, true, 48, array[1,2,3,4,5]::smallint[], 8, 18, 2, 4.8, 667, 'Free cancellation until 48 hours before the slot; $90 after that.', null, true),
  ('c1ea0000-0000-4000-8000-000000000014'::uuid, 'sparrowgate-cleaning', 'Sparrowgate Cleaning (fictional)', array['94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94131','94132','94133','94134']::text[], 80, 30, 22, 55, 38, 50, 40, 60, 25, 20, 50, 20, 48, true, true, true, true, true, 24, array[1,2,3,4,5]::smallint[], 8, 18, 2, 3.9, 119, 'Free cancellation until 24 hours before the slot; $30 after that.', 'Paused: not taking new jobs.', false);
