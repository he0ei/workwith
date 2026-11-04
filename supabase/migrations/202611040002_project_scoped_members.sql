-- A member may be limited to one project (project_scope = that project's id).
-- Their reads return only that project's rows; members without a scope are unchanged.
begin;
alter table public.workwith_members drop constraint workwith_members_member_id_check;
alter table public.workwith_members add constraint workwith_members_member_id_check check(member_id in ('ceo','sj','sy','jh','shpark'));
alter table public.workwith_members add column project_scope text;

create function public.workwith_member_scope() returns text
language sql stable security definer set search_path='' as $$
 select project_scope from public.workwith_members where user_id=auth.uid()
$$;
revoke all on function public.workwith_member_scope() from public,anon;
grant execute on function public.workwith_member_scope() to authenticated,service_role;

-- A meeting note is in scope only when every project it links to is the scoped one,
-- because a note shared with another project may describe that project.
create function public.workwith_in_scope(p_entity text,p_payload jsonb,p_scope text) returns boolean
language sql immutable set search_path='' as $$
 select case p_entity
  when 'projects' then p_payload->>'id'=p_scope
  when 'minutes' then coalesce(p_payload->>'projectId','') in ('',p_scope)
   and not exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(p_payload->'projectIds')='array' then p_payload->'projectIds' else '[]'::jsonb end) x where x<>p_scope)
   and (p_payload->>'projectId'=p_scope or coalesce(p_payload->'projectIds','[]'::jsonb) ? p_scope)
  else coalesce(p_payload->>'projectId','')=p_scope
 end
$$;
revoke all on function public.workwith_in_scope(text,jsonb,text) from public,anon;
grant execute on function public.workwith_in_scope(text,jsonb,text) to authenticated,service_role;

drop policy records_visible on public.workwith_records;
create policy records_visible on public.workwith_records for select to authenticated using(
 public.workwith_member_id() is not null and (
 entity not in ('tasks','history') or payload->>'visibility'='shared' or payload->>'owner'=public.workwith_member_id()
 ) and (
 public.workwith_member_scope() is null or public.workwith_in_scope(entity,payload,public.workwith_member_scope())
 )
);
notify pgrst,'reload schema';
commit;
