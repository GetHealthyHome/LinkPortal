-- People can be marked as admins. An admin's own PIN then also unlocks the
-- admin tools (for 1 hour). The admin password keeps working as a backup.

alter table public.people add column is_admin boolean not null default false;

-- list_people now also says who is an admin.
drop function public.list_people();
create function public.list_people()
returns table (id uuid, name text, has_pin boolean, is_admin boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.pin_hash is not null, p.is_admin
  from public.people p order by lower(p.name);
$$;

-- Builds the success reply for a person sign-in: their own session, plus an
-- admin session when they are an admin.
create function portal_private.person_sign_in(p_person_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_result jsonb := jsonb_build_object('ok', true,
    'token', portal_private.new_session('person', p_person_id, interval '30 minutes'));
begin
  if exists (select 1 from public.people where id = p_person_id and is_admin) then
    v_result := v_result || jsonb_build_object('admin_token',
      -- Tied to the person so it ends if they stop being an admin or are removed.
      portal_private.new_session('admin', p_person_id, interval '1 hour'));
  end if;
  return v_result;
end $$;

create or replace function public.unlock_person(p_person_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_person public.people%rowtype;
begin
  select * into v_person from public.people where id = p_person_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Person not found');
  end if;

  if v_person.pin_hash is null then
    return jsonb_build_object('ok', false, 'needs_pin', true,
      'error', 'No PIN yet. Create one to continue.');
  end if;

  if v_person.locked_until is not null and v_person.locked_until > now() then
    return jsonb_build_object('ok', false, 'error',
      'Too many wrong PINs. Try again in a few minutes.');
  end if;

  if p_pin is null or v_person.pin_hash <> extensions.crypt(p_pin, v_person.pin_hash) then
    update public.people
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
    where id = p_person_id;
    return jsonb_build_object('ok', false, 'error', 'Wrong PIN');
  end if;

  update public.people set failed_attempts = 0, locked_until = null where id = p_person_id;
  return portal_private.person_sign_in(p_person_id);
end $$;

create or replace function public.create_first_pin(p_person_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN must be exactly 4 digits');
  end if;

  update public.people
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      failed_attempts = 0, locked_until = null
  where id = p_person_id and pin_hash is null;

  if not found then
    return jsonb_build_object('ok', false, 'error',
      'A PIN has already been set for this person. Enter it instead.');
  end if;

  return portal_private.person_sign_in(p_person_id);
end $$;

-- Admin marks (or unmarks) a person as an admin.
create function public.admin_set_admin(p_token text, p_person_id uuid, p_is_admin boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  update public.people set is_admin = coalesce(p_is_admin, false) where id = p_person_id;
  if not coalesce(p_is_admin, false) then
    delete from portal_private.sessions where kind = 'admin' and person_id = p_person_id;
  end if;
end $$;

revoke execute on function portal_private.person_sign_in(uuid) from public, anon, authenticated;

revoke execute on function
  public.list_people(),
  public.admin_set_admin(text, uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.list_people(),
  public.admin_set_admin(text, uuid, boolean)
to anon, authenticated;
