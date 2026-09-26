-- LinkPortal schema
--
-- The browser only ever talks to the database through the functions below
-- (using the public "publishable" key). Tables have row level security turned
-- on with no policies, so they cannot be read or written directly. Every
-- function that changes data checks either a person's PIN session or the
-- admin session first.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists portal_private;
revoke all on schema portal_private from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.master_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 40),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.apps (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 1 and 60),
  url               text not null check (url ~* '^https?://'),
  -- Uploaded icon as a small data: URL. NULL means "use the site's own icon".
  icon_data         text check (icon_data is null or (icon_data like 'data:image/%' and length(icon_data) <= 400000)),
  master_folder_id  uuid references public.master_folders(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.people (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 1 and 60),
  pin_hash         text not null,
  -- Home screen layout, e.g.
  -- [{"type":"app","id":"<uuid>"},
  --  {"type":"folder","id":"f1","name":"Sales","apps":["<uuid>","<uuid>"]}]
  layout           jsonb not null default '[]'::jsonb,
  failed_attempts  integer not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now()
);

create unique index people_name_unique on public.people (lower(btrim(name)));

create table portal_private.sessions (
  token_hash  text primary key,
  kind        text not null check (kind in ('person', 'admin')),
  person_id   uuid references public.people(id) on delete cascade,
  expires_at  timestamptz not null
);

create table portal_private.admin_settings (
  id               boolean primary key default true check (id),
  password_hash    text,
  failed_attempts  integer not null default 0,
  locked_until     timestamptz
);
insert into portal_private.admin_settings (id) values (true);

alter table public.master_folders enable row level security;
alter table public.apps           enable row level security;
alter table public.people         enable row level security;
revoke all on public.master_folders, public.apps, public.people from anon, authenticated;

-------------------------------------------------------------------------------
-- Private helpers (not reachable from the browser)
-------------------------------------------------------------------------------

create function portal_private.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create function portal_private.new_session(p_kind text, p_person_id uuid, p_ttl interval)
returns text language plpgsql set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from portal_private.sessions where expires_at < now();
  insert into portal_private.sessions (token_hash, kind, person_id, expires_at)
  values (portal_private.hash_token(v_token), p_kind, p_person_id, now() + p_ttl);
  return v_token;
end $$;

create function portal_private.is_admin(p_token text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from portal_private.sessions
    where token_hash = portal_private.hash_token(coalesce(p_token, ''))
      and kind = 'admin' and expires_at > now()
  );
$$;

create function portal_private.require_admin(p_token text)
returns void language plpgsql stable set search_path = '' as $$
begin
  if not portal_private.is_admin(p_token) then
    raise exception 'Admin sign-in required' using errcode = '28000';
  end if;
end $$;

-- A person may edit their own board; the admin may edit anyone's.
create function portal_private.require_person_or_admin(p_token text, p_person_id uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if portal_private.is_admin(p_token) then return; end if;
  if not exists (
    select 1 from portal_private.sessions
    where token_hash = portal_private.hash_token(coalesce(p_token, ''))
      and kind = 'person' and person_id = p_person_id and expires_at > now()
  ) then
    raise exception 'Enter your PIN to make changes' using errcode = '28000';
  end if;
end $$;

create function portal_private.check_pin_format(p_pin text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = '22023';
  end if;
end $$;

-- Drops unknown or duplicate apps and empty folders, and trims names.
create function portal_private.clean_layout(p_layout jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_result  jsonb  := '[]'::jsonb;
  v_seen    uuid[] := '{}';
  v_item    jsonb;
  v_entry   jsonb;
  v_app_id  uuid;
  v_apps    jsonb;
begin
  if p_layout is null or jsonb_typeof(p_layout) <> 'array' then
    return v_result;
  end if;

  for v_item in select value from jsonb_array_elements(p_layout) loop
    if v_item->>'type' = 'app' then
      begin
        v_app_id := (v_item->>'id')::uuid;
      exception when others then
        continue;
      end;
      if v_app_id is null or v_app_id = any(v_seen)
         or not exists (select 1 from public.apps where id = v_app_id) then
        continue;
      end if;
      v_seen := v_seen || v_app_id;
      v_result := v_result || jsonb_build_array(jsonb_build_object('type', 'app', 'id', v_app_id));

    elsif v_item->>'type' = 'folder' then
      v_apps := '[]'::jsonb;
      if jsonb_typeof(v_item->'apps') = 'array' then
        for v_entry in select value from jsonb_array_elements(v_item->'apps') loop
          begin
            v_app_id := (v_entry #>> '{}')::uuid;
          exception when others then
            continue;
          end;
          if v_app_id is null or v_app_id = any(v_seen)
             or not exists (select 1 from public.apps where id = v_app_id) then
            continue;
          end if;
          v_seen := v_seen || v_app_id;
          v_apps := v_apps || jsonb_build_array(to_jsonb(v_app_id));
        end loop;
      end if;
      if jsonb_array_length(v_apps) > 0 then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'type', 'folder',
          'id',   coalesce(nullif(left(v_item->>'id', 64), ''), gen_random_uuid()::text),
          'name', coalesce(nullif(left(btrim(v_item->>'name'), 40), ''), 'Folder'),
          'apps', v_apps
        ));
      end if;
    end if;
  end loop;

  return v_result;
end $$;

-- Starting layout built from the admin's master folders: apps that belong to a
-- master folder are grouped into a folder with that name, the rest sit loose.
create function portal_private.default_layout(p_app_ids uuid[])
returns jsonb language sql stable set search_path = '' as $$
  with chosen as (
    select a.id, a.name, a.master_folder_id
    from public.apps a
    where a.id = any(coalesce(p_app_ids, '{}'))
  ),
  folders as (
    select 1 as grp, f.sort_order, f.name as sort_name,
           jsonb_build_object(
             'type', 'folder',
             'id',   f.id::text,
             'name', f.name,
             'apps', (select jsonb_agg(c.id order by lower(c.name))
                      from chosen c where c.master_folder_id = f.id)
           ) as item
    from public.master_folders f
    where exists (select 1 from chosen c where c.master_folder_id = f.id)
  ),
  loose as (
    select 2 as grp, 0 as sort_order, lower(c.name) as sort_name,
           jsonb_build_object('type', 'app', 'id', c.id) as item
    from chosen c
    where c.master_folder_id is null
  )
  select coalesce(jsonb_agg(item order by grp, sort_order, sort_name), '[]'::jsonb)
  from (select * from folders union all select * from loose) x;
$$;

-------------------------------------------------------------------------------
-- Public (browser) functions: reading
-------------------------------------------------------------------------------

create function public.list_people()
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name from public.people p order by lower(p.name);
$$;

create function public.list_apps()
returns table (id uuid, name text, url text, icon_data text, master_folder_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.url, a.icon_data, a.master_folder_id
  from public.apps a order by lower(a.name);
$$;

create function public.list_master_folders()
returns table (id uuid, name text, sort_order integer)
language sql stable security definer set search_path = '' as $$
  select f.id, f.name, f.sort_order
  from public.master_folders f order by f.sort_order, lower(f.name);
$$;

create function public.get_board(p_person_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select portal_private.clean_layout(p.layout) from public.people p where p.id = p_person_id;
$$;

-------------------------------------------------------------------------------
-- Public functions: a person unlocking and editing their own board
-------------------------------------------------------------------------------

-- Returns {"ok":true,"token":"..."} or {"ok":false,"error":"..."}.
-- (Returns instead of raising so the failed-attempt counter is saved.)
create function public.unlock_person(p_person_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_person public.people%rowtype;
begin
  select * into v_person from public.people where id = p_person_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Person not found');
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

create function public.save_board(p_token text, p_person_id uuid, p_layout jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_clean jsonb;
begin
  perform portal_private.require_person_or_admin(p_token, p_person_id);
  v_clean := portal_private.clean_layout(p_layout);
  update public.people set layout = v_clean where id = p_person_id;
  return v_clean;
end $$;

create function public.change_pin(p_token text, p_person_id uuid, p_new_pin text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_person_or_admin(p_token, p_person_id);
  perform portal_private.check_pin_format(p_new_pin);
  update public.people
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
      failed_attempts = 0, locked_until = null
  where id = p_person_id;
end $$;

create function public.end_session(p_token text)
returns void
language sql volatile security definer set search_path = '' as $$
  delete from portal_private.sessions
  where token_hash = portal_private.hash_token(coalesce(p_token, ''));
$$;

-------------------------------------------------------------------------------
-- Public functions: admin
-------------------------------------------------------------------------------

create function public.admin_login(p_password text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_settings portal_private.admin_settings%rowtype;
begin
  select * into v_settings from portal_private.admin_settings where id for update;

  if v_settings.password_hash is null then
    return jsonb_build_object('ok', false, 'error',
      'The admin password has not been set up yet. See the README.');
  end if;

  if v_settings.locked_until is not null and v_settings.locked_until > now() then
    return jsonb_build_object('ok', false, 'error',
      'Too many wrong passwords. Try again in a few minutes.');
  end if;

  if p_password is null
     or v_settings.password_hash <> extensions.crypt(p_password, v_settings.password_hash) then
    update portal_private.admin_settings
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
    where id;
    return jsonb_build_object('ok', false, 'error', 'Wrong password');
  end if;

  update portal_private.admin_settings set failed_attempts = 0, locked_until = null where id;
  return jsonb_build_object('ok', true,
    'token', portal_private.new_session('admin', null, interval '8 hours'));
end $$;

create function public.admin_check(p_token text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select portal_private.is_admin(p_token);
$$;

create function public.admin_change_password(p_token text, p_new_password text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  if p_new_password is null or length(p_new_password) < 10 then
    raise exception 'Admin password must be at least 10 characters' using errcode = '22023';
  end if;
  update portal_private.admin_settings
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where id;
  -- Sign out every other admin session.
  delete from portal_private.sessions
  where kind = 'admin' and token_hash <> portal_private.hash_token(p_token);
end $$;

-- People

create function public.admin_create_person(p_token text, p_name text, p_pin text, p_app_ids uuid[])
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform portal_private.require_admin(p_token);
  perform portal_private.check_pin_format(p_pin);
  insert into public.people (name, pin_hash, layout)
  values (btrim(p_name),
          extensions.crypt(p_pin, extensions.gen_salt('bf')),
          portal_private.default_layout(p_app_ids))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Someone with that name already exists' using errcode = '23505';
end $$;

create function public.admin_rename_person(p_token text, p_person_id uuid, p_name text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  update public.people set name = btrim(p_name) where id = p_person_id;
exception when unique_violation then
  raise exception 'Someone with that name already exists' using errcode = '23505';
end $$;

create function public.admin_delete_person(p_token text, p_person_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  delete from public.people where id = p_person_id;
end $$;

-- Apps

create function public.admin_save_app(
  p_token text, p_app_id uuid, p_name text, p_url text,
  p_icon_data text, p_master_folder_id uuid
)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform portal_private.require_admin(p_token);
  if p_app_id is null then
    insert into public.apps (name, url, icon_data, master_folder_id)
    values (btrim(p_name), btrim(p_url), p_icon_data, p_master_folder_id)
    returning id into v_id;
  else
    update public.apps
    set name = btrim(p_name), url = btrim(p_url),
        icon_data = p_icon_data, master_folder_id = p_master_folder_id
    where id = p_app_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.admin_delete_app(p_token text, p_app_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  delete from public.apps where id = p_app_id;
  -- Layouts are cleaned when they are next read or saved.
end $$;

-- Adds an app to the given people's boards (all people when p_person_ids is null).
-- It goes into their folder named after the app's master folder if they have one,
-- otherwise onto the end of their home screen.
create function public.admin_add_app_to_people(p_token text, p_app_id uuid, p_person_ids uuid[])
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_folder_name text;
  v_person      record;
  v_layout      jsonb;
  v_idx         integer;
begin
  perform portal_private.require_admin(p_token);

  select f.name into v_folder_name
  from public.apps a left join public.master_folders f on f.id = a.master_folder_id
  where a.id = p_app_id;
  if not found then
    raise exception 'App not found';
  end if;

  for v_person in
    select id, layout from public.people
    where p_person_ids is null or id = any(p_person_ids)
  loop
    v_layout := portal_private.clean_layout(v_person.layout);

    -- Skip people who already have the app.
    if exists (
      select 1 from jsonb_array_elements(v_layout) e
      where (e.value->>'type' = 'app' and e.value->>'id' = p_app_id::text)
         or (e.value->>'type' = 'folder' and e.value->'apps' ? p_app_id::text)
    ) then
      continue;
    end if;

    v_idx := null;
    if v_folder_name is not null then
      select (e.ordinality - 1)::integer into v_idx
      from jsonb_array_elements(v_layout) with ordinality e
      where e.value->>'type' = 'folder' and lower(e.value->>'name') = lower(v_folder_name)
      limit 1;
    end if;

    if v_idx is not null then
      v_layout := jsonb_set(v_layout, array[v_idx::text, 'apps'],
                            (v_layout->v_idx->'apps') || jsonb_build_array(p_app_id));
    else
      v_layout := v_layout || jsonb_build_array(jsonb_build_object('type', 'app', 'id', p_app_id));
    end if;

    update public.people set layout = v_layout where id = v_person.id;
  end loop;
end $$;

-- Master folders

create function public.admin_save_master_folder(p_token text, p_folder_id uuid, p_name text, p_sort_order integer)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform portal_private.require_admin(p_token);
  if p_folder_id is null then
    insert into public.master_folders (name, sort_order)
    values (btrim(p_name), coalesce(p_sort_order,
            (select coalesce(max(sort_order), 0) + 1 from public.master_folders)))
    returning id into v_id;
  else
    update public.master_folders
    set name = btrim(p_name), sort_order = coalesce(p_sort_order, sort_order)
    where id = p_folder_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.admin_delete_master_folder(p_token text, p_folder_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_admin(p_token);
  delete from public.master_folders where id = p_folder_id;
end $$;

-- Used by the app to build a starting layout for "Reset to company layout".
create function public.default_layout(p_app_ids uuid[])
returns jsonb
language sql stable security definer set search_path = '' as $$
  select portal_private.default_layout(p_app_ids);
$$;

-------------------------------------------------------------------------------
-- Permissions: only the public functions above are callable from the browser.
-------------------------------------------------------------------------------

revoke execute on all functions in schema portal_private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.list_people(),
  public.list_apps(),
  public.list_master_folders(),
  public.get_board(uuid),
  public.unlock_person(uuid, text),
  public.save_board(text, uuid, jsonb),
  public.change_pin(text, uuid, text),
  public.end_session(text),
  public.admin_login(text),
  public.admin_check(text),
  public.admin_change_password(text, text),
  public.admin_create_person(text, text, text, uuid[]),
  public.admin_rename_person(text, uuid, text),
  public.admin_delete_person(text, uuid),
  public.admin_save_app(text, uuid, text, text, text, uuid),
  public.admin_delete_app(text, uuid),
  public.admin_add_app_to_people(text, uuid, uuid[]),
  public.admin_save_master_folder(text, uuid, text, integer),
  public.admin_delete_master_folder(text, uuid),
  public.default_layout(uuid[])
to anon, authenticated;
