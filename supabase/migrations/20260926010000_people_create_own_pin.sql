-- Let the admin add a person without a PIN. The first time that person opens
-- their settings they create their own PIN. The admin can also clear a PIN so
-- the person picks a new one.

alter table public.people alter column pin_hash drop not null;

-- list_people now also says whether each person has a PIN yet.
drop function public.list_people();
create function public.list_people()
returns table (id uuid, name text, has_pin boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.pin_hash is not null
  from public.people p order by lower(p.name);
$$;

-- A person with no PIN can't be unlocked; they must create one first.
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
  return jsonb_build_object('ok', true,
    'token', portal_private.new_session('person', p_person_id, interval '30 minutes'));
end $$;

-- Sets a person's very first PIN and signs them in. Only works while they have
-- no PIN, so it can't be used to take over someone who already has one.
create function public.create_first_pin(p_person_id uuid, p_pin text)
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

  return jsonb_build_object('ok', true,
    'token', portal_private.new_session('person', p_person_id, interval '30 minutes'));
end $$;

-- A blank PIN now means "let them create their own".
create or replace function public.admin_create_person(p_token text, p_name text, p_pin text, p_app_ids uuid[])
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform portal_private.require_admin(p_token);
  if nullif(btrim(coalesce(p_pin, '')), '') is not null then
    perform portal_private.check_pin_format(p_pin);
  end if;
  insert into public.people (name, pin_hash, layout)
  values (btrim(p_name),
          case when nullif(btrim(coalesce(p_pin, '')), '') is null then null
               else extensions.crypt(p_pin, extensions.gen_salt('bf')) end,
          portal_private.default_layout(p_app_ids))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Someone with that name already exists' using errcode = '23505';
end $$;

-- Admin clears a PIN; the person creates a new one next time. Signs them out.
create function public.admin_clear_pin(p_token text, p_person_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  update public.people
  set pin_hash = null, failed_attempts = 0, locked_until = null
  where id = p_person_id;
  delete from portal_private.sessions where kind = 'person' and person_id = p_person_id;
end $$;

revoke execute on function
  public.list_people(),
  public.create_first_pin(uuid, text),
  public.admin_clear_pin(text, uuid)
from public, anon, authenticated;

grant execute on function
  public.list_people(),
  public.create_first_pin(uuid, text),
  public.admin_clear_pin(text, uuid)
to anon, authenticated;
