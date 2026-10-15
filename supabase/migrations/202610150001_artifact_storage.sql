-- Private team deliverables only. No public bucket or service-role key in the app.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workwith-artifacts','workwith-artifacts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;

create policy workwith_artifacts_read on storage.objects for select to authenticated
using(bucket_id='workwith-artifacts' and public.workwith_member_id() is not null);
create policy workwith_artifacts_upload on storage.objects for insert to authenticated
with check(bucket_id='workwith-artifacts' and public.workwith_member_id() is not null and (storage.foldername(name))[1]=auth.uid()::text);
create policy workwith_artifacts_delete on storage.objects for delete to authenticated
using(bucket_id='workwith-artifacts' and public.workwith_member_id() is not null);
-- No UPDATE policy: replacement uploads use a fresh immutable object path.
commit;
