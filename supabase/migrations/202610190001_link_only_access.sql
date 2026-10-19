-- Apply only when the verified shared-link Edge Function is ready.
-- Existing account records remain for historical author IDs. Direct Auth sessions
-- no longer provide business-data or attachment access. service_role is unchanged.
revoke all on public.workwith_members,public.workwith_workspace,public.workwith_records from authenticated;
revoke execute on function public.workwith_snapshot() from authenticated;
revoke execute on function public.workwith_revision() from authenticated;
revoke execute on function public.workwith_password_status() from authenticated;
create policy workwith_shared_link_only on storage.objects as restrictive
for all to authenticated
using(bucket_id not in ('workwith-artifacts','workwith-task-files'))
with check(bucket_id not in ('workwith-artifacts','workwith-task-files'));
