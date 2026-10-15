begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workwith-task-files','workwith-task-files',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
-- Security definer checks all references, including private rows hidden by record RLS.
-- An uploader may clean a new, unreferenced file, but cannot retain access after
-- another owner's shared task becomes private.
create function public.workwith_task_file_access(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.workwith_member_id() is not null and (
 exists(select 1 from public.workwith_records r where r.entity='tasks' and r.payload->'attachment'->>'bucket'='workwith-task-files' and r.payload->'attachment'->>'path'=object_name and (r.payload->>'visibility'='shared' or r.payload->>'owner'=public.workwith_member_id()))
 or (split_part(object_name,'/',1)=auth.uid()::text and not exists(select 1 from public.workwith_records r where r.entity='tasks' and r.payload->'attachment'->>'bucket'='workwith-task-files' and r.payload->'attachment'->>'path'=object_name))
 )
$$;
revoke all on function public.workwith_task_file_access(text) from public,anon;
grant execute on function public.workwith_task_file_access(text) to authenticated;
create policy workwith_task_files_read on storage.objects for select to authenticated
using(bucket_id='workwith-task-files' and public.workwith_task_file_access(name));
create policy workwith_task_files_upload on storage.objects for insert to authenticated
with check(bucket_id='workwith-task-files' and public.workwith_member_id() is not null and (storage.foldername(name))[1]=auth.uid()::text);
create policy workwith_task_files_delete on storage.objects for delete to authenticated
using(bucket_id='workwith-task-files' and public.workwith_task_file_access(name));
commit;
