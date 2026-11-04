-- Files follow the same project scope as records (see 202611040002), and the
-- client learns its scope so it can hide actions the server would refuse.
begin;
create or replace function public.workwith_password_status() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare member record;
begin
 select member_id,password_change_required,project_scope into member from public.workwith_members where user_id=auth.uid();
 if not found then raise exception '등록된 팀원만 이용할 수 있습니다.' using errcode='42501'; end if;
 return jsonb_build_object('user',member.member_id,'required',member.password_change_required,'scope',member.project_scope);
end $$;
create or replace function public.workwith_task_file_access(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.workwith_member_id() is not null and (
 exists(select 1 from public.workwith_records r where r.entity='tasks' and r.payload->'attachment'->>'bucket'='workwith-task-files' and r.payload->'attachment'->>'path'=object_name and (r.payload->>'visibility'='shared' or r.payload->>'owner'=public.workwith_member_id())
  and (public.workwith_member_scope() is null or public.workwith_in_scope('tasks',r.payload,public.workwith_member_scope())))
 or (split_part(object_name,'/',1)=auth.uid()::text and not exists(select 1 from public.workwith_records r where r.entity='tasks' and r.payload->'attachment'->>'bucket'='workwith-task-files' and r.payload->'attachment'->>'path'=object_name))
 )
$$;

create function public.workwith_artifact_file_access(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.workwith_member_id() is not null and (
 public.workwith_member_scope() is null
 or exists(select 1 from public.workwith_records r where r.entity='artifacts' and r.payload->'attachment'->>'bucket'='workwith-artifacts' and r.payload->'attachment'->>'path'=object_name and public.workwith_in_scope('artifacts',r.payload,public.workwith_member_scope()))
 or (split_part(object_name,'/',1)=auth.uid()::text and not exists(select 1 from public.workwith_records r where r.entity='artifacts' and r.payload->'attachment'->>'path'=object_name))
 )
$$;
revoke all on function public.workwith_artifact_file_access(text) from public,anon;
grant execute on function public.workwith_artifact_file_access(text) to authenticated;

drop policy workwith_artifacts_read on storage.objects;
create policy workwith_artifacts_read on storage.objects for select to authenticated
using(bucket_id='workwith-artifacts' and public.workwith_artifact_file_access(name));
drop policy workwith_artifacts_delete on storage.objects;
create policy workwith_artifacts_delete on storage.objects for delete to authenticated
using(bucket_id='workwith-artifacts' and public.workwith_artifact_file_access(name));
commit;
