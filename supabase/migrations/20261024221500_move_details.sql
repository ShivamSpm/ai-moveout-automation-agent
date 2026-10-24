-- Move details captured after sign-in: who is moving, how to reach the landlord,
-- and the apartment size that cleaning and moving quotes are based on.
-- moves already has owner-only RLS (init migration), so these columns are visible
-- to the renter who owns the move and no one else. Same rules as the app's zod
-- schema in web/src/lib/move-details-schema.ts.

alter table public.moves
  add column renter_name text check (renter_name is null or length(renter_name) between 1 and 100),
  add column landlord_phone text check (landlord_phone is null or landlord_phone ~ '^\+?[0-9 ().-]{7,20}$'),
  add column zip text check (zip is null or zip ~ '^[0-9]{5}$'),
  add column bedrooms smallint check (bedrooms is null or bedrooms between 0 and 10),
  add column bathrooms numeric(3, 1) check (
    bathrooms is null or (bathrooms between 0.5 and 10 and bathrooms * 2 = trunc(bathrooms * 2))
  ),
  add column sqft integer check (sqft is null or sqft between 100 and 20000);
