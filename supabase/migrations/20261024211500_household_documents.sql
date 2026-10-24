-- Household access is read-only, explicit and tied to a verified invitation.
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null,
 owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 created_at timestamptz not null default now(), unique(id, owner_id)
);
create index households_owner_idx on public.households(owner_id);
create table public.household_members (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households on delete cascade,
 user_id uuid references auth.users on delete cascade,
 role text not null check(role in ('owner','member')),
 status text not null check(status in ('invited','active','revoked')),
 invited_email text not null, invite_token_hash text unique check(invite_token_hash ~ '^[0-9a-f]{64}$'),
 invited_at timestamptz not null default now(), accepted_at timestamptz, expires_at timestamptz,
 unique(household_id,user_id), check(status <> 'active' or (user_id is not null and accepted_at is not null))
);
create index household_members_household_idx on public.household_members(household_id);
create index household_members_user_idx on public.household_members(user_id);
alter table public.moves add column household_id uuid;
alter table public.moves add foreign key(household_id,owner_id) references public.households(id,owner_id);
create index moves_household_idx on public.moves(household_id);
alter table public.documents add column shared_with_household boolean not null default true;
alter table public.tasks add column document_id uuid;
alter table public.tasks add foreign key(document_id,owner_id) references public.documents(id,owner_id) on delete set null (document_id);
create index tasks_document_idx on public.tasks(document_id);

create function private.household_owner(h uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.households where id=h and owner_id=(select auth.uid()))
$$;
create function private.household_active(h uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.household_members where household_id=h and user_id=(select auth.uid()) and status='active' and (expires_at is null or expires_at>now()))
$$;
create function private.shared_document(d uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.documents d join public.moves m on m.id=d.move_id and m.owner_id=d.owner_id
 where d.id=$1 and (storage.foldername(d.storage_path))[1]=d.owner_id::text and d.shared_with_household and private.household_active(m.household_id))
$$;
create function private.shared_object(p text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.documents d where d.storage_path=p and private.shared_document(d.id))
$$;
grant usage on schema private to authenticated;
revoke all on function private.household_owner(uuid), private.household_active(uuid), private.shared_document(uuid), private.shared_object(text) from public, anon;
grant execute on function private.household_owner(uuid), private.household_active(uuid), private.shared_document(uuid), private.shared_object(text) to authenticated;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
-- Membership writes go through checked functions; owners cannot self-accept invitees.
grant select,insert,update on public.households to authenticated;
revoke delete on public.households from authenticated;
grant select on public.household_members to authenticated;
revoke insert,update,delete on public.household_members from authenticated;
create policy household_owner on public.households for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy household_member_read on public.households for select to authenticated using(private.household_active(id));
create policy membership_read on public.household_members for select to authenticated using(private.household_owner(household_id) or user_id=(select auth.uid()));
create policy document_member_read on public.documents for select to authenticated using(private.shared_document(id));
create policy findings_member_read on public.lease_findings for select to authenticated using(private.shared_document(document_id));
create policy tasks_member_read on public.tasks for select to authenticated using(private.shared_document(document_id));
create policy move_files_member_read on storage.objects for select to authenticated using(bucket_id='move-files' and private.shared_object(name));

create function private.member_moves() returns table(id uuid, title text, move_out_date date, household_id uuid, owner_id uuid)
language sql stable security definer set search_path = '' as $$
 select m.id,m.title,m.move_out_date,m.household_id,m.owner_id from public.moves m
 where m.owner_id=(select auth.uid()) or private.household_active(m.household_id)
$$;
create function public.household_moves() returns table(id uuid, title text, move_out_date date, household_id uuid, owner_id uuid)
language sql security invoker set search_path = '' as $$ select * from private.member_moves() $$;

create function private.invite_member(h uuid, email text, token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 perform 1 from public.households where id=h for update;
 if not private.household_owner(h) then raise exception 'Household not found'; end if;
 if lower(trim(email)) = (select lower(u.email) from auth.users u where u.id=auth.uid()) then raise exception 'Already the owner'; end if;
 update public.household_members set status='revoked' where household_id=h and lower(invited_email)=lower(trim(email)) and status='invited';
 insert into public.household_members(household_id,role,status,invited_email,invite_token_hash,expires_at)
 values(h,'member','invited',lower(trim(email)),token_hash,now()+interval '7 days') returning id into result;
 return result;
end $$;
create function public.invite_household_member(h uuid,email text,token_hash text) returns uuid language sql security invoker set search_path = '' as $$ select private.invite_member(h,email,token_hash) $$;
create function private.accept_member(token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation public.household_members; account_email text;
begin
 select * into invitation from public.household_members where invite_token_hash=token_hash for update;
 select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if invitation.id is null or invitation.status<>'invited' or invitation.expires_at<=now() or account_email is null or account_email<>lower(invitation.invited_email) then
 raise exception 'Invite is invalid, expired, or belongs to a different email'; end if;
 -- Reinvitation of a revoked member keeps one membership per household/account.
 delete from public.household_members where household_id=invitation.household_id and user_id=auth.uid() and status='revoked';
 update public.household_members set user_id=auth.uid(),status='active',accepted_at=now(),expires_at=null,invite_token_hash=null where id=invitation.id;
 return invitation.household_id;
end $$;
create function public.accept_household_invite(token_hash text) returns uuid language sql security invoker set search_path = '' as $$ select private.accept_member(token_hash) $$;
create function private.revoke_member(member_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.household_members set status='revoked',invite_token_hash=null where id=member_id and role='member' and (private.household_owner(household_id) or user_id=auth.uid());
 if not found then raise exception 'Membership not found'; end if;
end $$;
create function public.revoke_household_member(member_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.revoke_member(member_id) $$;

-- Serialize lease replacement with task status updates. All data belongs to caller.
create function private.save_lease_result(doc uuid, findings jsonb, plan jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.documents; f jsonb; t jsonb;
begin
 select * into d from public.documents where id=doc and owner_id=auth.uid() and kind='lease' for update;
 if d.id is null then raise exception 'Lease not found'; end if;
 perform 1 from public.moves where id=d.move_id for update;
 delete from public.lease_findings where document_id=doc and owner_id=auth.uid();
 for f in select * from jsonb_array_elements(findings) loop
 insert into public.lease_findings(move_id,owner_id,document_id,rule_key,value,quote,page,confidence,extractor)
 values(d.move_id,d.owner_id,d.id,f->>'rule_key',f->'value',f->>'quote',(f->>'page')::integer,f->>'confidence','pattern');
 end loop;
 delete from public.tasks where move_id=d.move_id and document_id=doc and source_kind='lease' and status<>'done'
 and task_key not in(select e->>'task_key' from jsonb_array_elements(plan) e);
 for t in select * from jsonb_array_elements(plan) loop
 insert into public.tasks as existing(move_id,owner_id,document_id,task_key,lane,title,detail,due_date,source,source_kind)
 values(d.move_id,d.owner_id,d.id,t->>'task_key',t->>'lane',t->>'title',t->>'detail',(t->>'due_date')::date,t->>'source','lease')
 on conflict(move_id,task_key) do update set document_id=excluded.document_id,lane=excluded.lane,title=excluded.title,detail=excluded.detail,due_date=excluded.due_date,source=excluded.source,source_kind='lease'
 where existing.owner_id=auth.uid() and existing.source_kind='lease';
 end loop;
end $$;
create function public.save_lease_result(doc uuid, findings jsonb, plan jsonb) returns void language sql security invoker set search_path = '' as $$ select private.save_lease_result(doc,findings,plan) $$;
create function private.delete_lease_tasks() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.tasks where document_id=old.id and owner_id=old.owner_id and source_kind='lease' and status<>'done';
 return old;
end $$;
create trigger document_delete_tasks before delete on public.documents for each row execute function private.delete_lease_tasks();

-- Defense in depth: auth deletion cannot silently remove an active household.
create function private.guard_household_account_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.households h join public.household_members m on m.household_id=h.id where h.owner_id=old.id and m.user_id<>old.id and m.status='active' and (m.expires_at is null or m.expires_at>now())) then
 raise exception 'Remove active household members before closing your account'; end if;
 return old;
end $$;
create trigger guard_household_account_delete before delete on auth.users for each row execute function private.guard_household_account_delete();

do $$ declare signature text; begin
 foreach signature in array array['private.member_moves()','public.household_moves()','private.invite_member(uuid,text,text)','public.invite_household_member(uuid,text,text)','private.accept_member(text)','public.accept_household_invite(text)','private.revoke_member(uuid)','public.revoke_household_member(uuid)','private.save_lease_result(uuid,jsonb,jsonb)','public.save_lease_result(uuid,jsonb,jsonb)'] loop
 execute 'revoke all on function '||signature||' from public, anon';
 execute 'grant execute on function '||signature||' to authenticated';
 end loop;
end $$;
revoke all on function private.delete_lease_tasks(),private.guard_household_account_delete() from public,anon,authenticated;

-- Prevent forged metadata from sharing an unregistered object in another account.
alter table public.documents add constraint documents_owner_storage_path check ((storage.foldername(storage_path))[1]=owner_id::text) not valid;
