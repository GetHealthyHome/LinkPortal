-- Favorites bar: the top 5 apps a person opens most, plus apps they pin.

-- How often each person has opened each app.
create table portal_private.app_visits (
  person_id     uuid not null references public.people(id) on delete cascade,
  app_id        uuid not null references public.apps(id) on delete cascade,
  visits        integer not null default 0,
  last_visited  timestamptz not null default now(),
  primary key (person_id, app_id)
);

-- Apps a person has pinned to their bar, in order (max 5).
alter table public.people add column pinned jsonb not null default '[]'::jsonb;

-- Counts one open. No PIN needed, like viewing a board. It only affects the
-- order of that person's own favorites bar, and only for apps on their board.
create function public.record_visit(p_person_id uuid, p_app_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.people p,
         jsonb_array_elements(portal_private.clean_layout(p.layout)) e
    where p.id = p_person_id
      and ((e.value->>'type' = 'app' and e.value->>'id' = p_app_id::text)
        or (e.value->>'type' = 'folder' and e.value->'apps' ? p_app_id::text))
  ) then
    return;
  end if;

  insert into portal_private.app_visits (person_id, app_id, visits, last_visited)
  values (p_person_id, p_app_id, 1, now())
  on conflict (person_id, app_id)
  do update set visits = least(portal_private.app_visits.visits + 1, 1000000),
                last_visited = now();
end $$;

-- Returns {"pinned": [...], "bar": [...]}: the person's pinned app ids, and the
-- up-to-5 apps to show (pinned first, then most opened), all on their board.
create function public.get_favorites(p_person_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with board as (
    select distinct app_id::uuid as app_id
    from public.people p,
         jsonb_array_elements(portal_private.clean_layout(p.layout)) e,
         lateral (
           select e.value->>'id' as app_id where e.value->>'type' = 'app'
           union all
           select x from jsonb_array_elements_text(e.value->'apps') x where e.value->>'type' = 'folder'
         ) ids
    where p.id = p_person_id
  ),
  pins as (
    select (x.value #>> '{}')::uuid as app_id, x.ordinality as ord
    from public.people p, jsonb_array_elements(p.pinned) with ordinality x
    where p.id = p_person_id
      and (x.value #>> '{}')::uuid in (select app_id from board)
  ),
  top as (
    select v.app_id, row_number() over (order by v.visits desc, v.last_visited desc) as ord
    from portal_private.app_visits v
    where v.person_id = p_person_id
      and v.app_id in (select app_id from board)
      and v.app_id not in (select app_id from pins)
  ),
  bar as (
    select app_id, 1 as grp, ord from pins
    union all
    select app_id, 2, ord from top
  )
  select jsonb_build_object(
    'pinned', coalesce((select jsonb_agg(app_id order by ord) from pins), '[]'::jsonb),
    'bar',    coalesce((select jsonb_agg(app_id order by grp, ord)
                        from (select * from bar order by grp, ord limit 5) b), '[]'::jsonb)
  );
$$;

-- Saves the pinned list (person's PIN session or admin). Keeps at most 5
-- existing, distinct apps.
create function public.save_pins(p_token text, p_person_id uuid, p_app_ids uuid[])
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_pins  uuid[] := '{}';
begin
  perform portal_private.require_person_or_admin(p_token, p_person_id);
  foreach v_id in array coalesce(p_app_ids, '{}') loop
    exit when cardinality(v_pins) >= 5;
    if v_id is not null and not v_id = any(v_pins)
       and exists (select 1 from public.apps where id = v_id) then
      v_pins := v_pins || v_id;
    end if;
  end loop;
  update public.people set pinned = to_jsonb(v_pins) where id = p_person_id;
end $$;

revoke execute on function
  public.record_visit(uuid, uuid),
  public.get_favorites(uuid),
  public.save_pins(text, uuid, uuid[])
from public, anon, authenticated;

grant execute on function
  public.record_visit(uuid, uuid),
  public.get_favorites(uuid),
  public.save_pins(text, uuid, uuid[])
to anon, authenticated;
