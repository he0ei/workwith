-- Restore member login: give signed-in team members back the read access that
-- 202610190001_link_only_access.sql removed. Writes still go only through the
-- workspace Edge Function (service_role); anon gets nothing.
begin;
grant select on public.workwith_members,public.workwith_workspace,public.workwith_records to authenticated;
grant execute on function public.workwith_snapshot() to authenticated;
grant execute on function public.workwith_revision() to authenticated;
grant execute on function public.workwith_password_status() to authenticated;
drop policy if exists workwith_shared_link_only on storage.objects;
commit;
