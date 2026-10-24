-- Optional renter-provided management company; existing ownership policies apply.
alter table public.moves add column property_management_company text
  check (char_length(property_management_company) <= 160);
