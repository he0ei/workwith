begin;
-- Existing signed-in accounts keep their current workflow. New / never-signed-in
-- members must replace the temporary password once; no password value is stored here.
alter table public.workwith_members add column password_change_required boolean not null default true;
update public.workwith_members m set password_change_required=false
where exists(select 1 from auth.users u where u.id=m.user_id and u.last_sign_in_at is not null);

create function public.workwith_password_status() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare member record;
begin
 select member_id,password_change_required into member from public.workwith_members where user_id=auth.uid();
 if not found then raise exception '등록된 팀원만 이용할 수 있습니다.' using errcode='42501'; end if;
 return jsonb_build_object('user',member.member_id,'required',member.password_change_required);
end $$;
revoke all on function public.workwith_password_status() from public,anon;
grant execute on function public.workwith_password_status() to authenticated;

create function public.workwith_password_updated() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.encrypted_password is distinct from new.encrypted_password then
  update public.workwith_members set password_change_required=false where user_id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.workwith_password_updated() from public,anon,authenticated;
create trigger workwith_password_updated after update of encrypted_password on auth.users
for each row execute function public.workwith_password_updated();

-- Pending accounts can inspect only their own setup flag, not workspace data/files.
create or replace function public.workwith_member_id() returns text
language sql stable security definer set search_path='' as $$
 select member_id from public.workwith_members where user_id=auth.uid() and not password_change_required
$$;

-- Drop only application change-history records; preserve tasks, projects, meetings,
-- files, record versions and Supabase's security/authentication audit facilities.
lock table public.workwith_workspace in row exclusive mode;
delete from public.workwith_records where entity='history';
update public.workwith_workspace set revision=revision+1 where id=1;
create function public.workwith_skip_history() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.entity='history' then return null; end if;
 return new;
end $$;
revoke all on function public.workwith_skip_history() from public,anon,authenticated;
create trigger workwith_skip_history before insert or update on public.workwith_records
for each row execute function public.workwith_skip_history();
notify pgrst,'reload schema';
commit;
