-- Preserve the original full address; structured values are renter-confirmed on edit.
alter table public.moves
  add column address_line1 text check (char_length(address_line1) <= 160),
  add column address_line2 text check (char_length(address_line2) <= 80),
  add column city text check (char_length(city) <= 100),
  add column region text check (char_length(region) <= 100);
