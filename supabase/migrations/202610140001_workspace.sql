-- Supabase Auth supplies auth.uid()/auth.role(). No business data or credentials here.
create table public.workwith_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 member_id text unique not null check(member_id in ('ceo','sj','sy','jh'))
);
create table public.workwith_workspace (id integer primary key check(id=1), revision bigint not null default 0);
insert into public.workwith_workspace(id) values(1);
create table public.workwith_records (
 entity text not null check(entity in ('projects','tasks','kpis','artifacts','minutes','history')),
 id text not null, payload jsonb not null check(jsonb_typeof(payload)='object'), version bigint not null,
 created_at timestamptz not null default clock_timestamp(), primary key(entity,id),
 check(payload->>'id'=id)
);
create index workwith_records_order on public.workwith_records(entity,created_at,id);
alter table public.workwith_members enable row level security;
alter table public.workwith_workspace enable row level security;
alter table public.workwith_records enable row level security;

create function public.workwith_member_id() returns text language sql stable security definer set search_path='' as $$
 select member_id from public.workwith_members where user_id=auth.uid()
$$;
revoke all on function public.workwith_member_id() from public,anon;
grant execute on function public.workwith_member_id() to authenticated,service_role;
create policy members_self on public.workwith_members for select to authenticated using(user_id=auth.uid());
create policy workspace_team on public.workwith_workspace for select to authenticated using(public.workwith_member_id() is not null);
create policy records_visible on public.workwith_records for select to authenticated using(
 public.workwith_member_id() is not null and (
 entity not in ('tasks','history') or payload->>'visibility'='shared' or payload->>'owner'=public.workwith_member_id()
 )
);
-- Clients can only read. All writes go through the authenticated Edge Function.
revoke all on public.workwith_members,public.workwith_workspace,public.workwith_records from anon,authenticated;
grant select on public.workwith_members,public.workwith_workspace,public.workwith_records to authenticated;
grant all on public.workwith_members,public.workwith_workspace,public.workwith_records to service_role;

create function public.workwith_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if public.workwith_member_id() is null and coalesce(auth.role(),'')<>'service_role' then
  raise exception '등록된 팀원만 이용할 수 있습니다.' using errcode='42501';
 end if;
 return (select jsonb_build_object('state',jsonb_build_object('version',1,'revision',(select revision from public.workwith_workspace where id=1),'projects',coalesce((select jsonb_agg(payload order by created_at,id) from public.workwith_records where entity='projects'),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(payload order by created_at,id) from public.workwith_records where entity='tasks'),'[]'::jsonb),'kpis',coalesce((select jsonb_agg(payload order by created_at,id) from public.workwith_records where entity='kpis'),'[]'::jsonb),'artifacts',coalesce((select jsonb_agg(payload order by created_at,id) from public.workwith_records where entity='artifacts'),'[]'::jsonb),'minutes',coalesce((select jsonb_agg(payload order by created_at,id) from public.workwith_records where entity='minutes'),'[]'::jsonb),'history',coalesce((select jsonb_agg(payload order by created_at,id) from public.workwith_records where entity='history'),'[]'::jsonb)),'versions',coalesce((select jsonb_object_agg(entity||':'||id,version) from public.workwith_records),'{}'::jsonb),'user',public.workwith_member_id()));
end $$;
revoke all on function public.workwith_snapshot() from public,anon;
grant execute on function public.workwith_snapshot() to authenticated,service_role;

create function public.workwith_revision() returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if public.workwith_member_id() is null and coalesce(auth.role(),'')<>'service_role' then
  raise exception '등록된 팀원만 이용할 수 있습니다.' using errcode='42501';
 end if;
 return (select jsonb_build_object('revision',revision) from public.workwith_workspace where id=1);
end $$;
revoke all on function public.workwith_revision() from public,anon;
grant execute on function public.workwith_revision() to authenticated,service_role;

-- This RPC is callable ONLY by the Edge Function's service_role.
-- The row lock + transaction protect the revision and all affected records together.
create function public.workwith_commit(p_revision bigint,p_upserts jsonb,p_deletes jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare new_revision bigint; item jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if jsonb_typeof(p_upserts)<>'array' or jsonb_typeof(p_deletes)<>'array' or jsonb_array_length(p_upserts)+jsonb_array_length(p_deletes)>200 then
  raise exception 'Invalid change set';
 end if;
 update public.workwith_workspace set revision=revision+1 where id=1 and revision=p_revision returning revision into new_revision;
 if not found then return false; end if;
 for item in select value from jsonb_array_elements(p_upserts) loop
  insert into public.workwith_records(entity,id,payload,version) values(item->>'entity',item->>'id',item->'payload',new_revision)
  on conflict(entity,id) do update set payload=excluded.payload,version=excluded.version;
 end loop;
 for item in select value from jsonb_array_elements(p_deletes) loop
  delete from public.workwith_records where entity=item->>'entity' and id=item->>'id';
 end loop;
 return true;
end $$;
revoke all on function public.workwith_commit(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.workwith_commit(bigint,jsonb,jsonb) to service_role;
