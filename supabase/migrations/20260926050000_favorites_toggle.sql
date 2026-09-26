-- Each person can turn the "Most Visited" favorites bar off (and back on).

alter table public.people add column show_favorites boolean not null default true;

-- get_favorites now also returns "show".
create or replace function public.get_favorites(p_person_id uuid)
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
    'show',   coalesce((select p.show_favorites from public.people p where p.id = p_person_id), true),
    'pinned', coalesce((select jsonb_agg(app_id order by ord) from pins), '[]'::jsonb),
    'bar',    coalesce((select jsonb_agg(app_id order by grp, ord)
                        from (select * from bar order by grp, ord limit 5) b), '[]'::jsonb)
  );
$$;

-- Turns the bar on or off (person's PIN session or admin).
create function public.set_show_favorites(p_token text, p_person_id uuid, p_show boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform portal_private.require_person_or_admin(p_token, p_person_id);
  update public.people set show_favorites = coalesce(p_show, true) where id = p_person_id;
end $$;

revoke execute on function public.set_show_favorites(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_show_favorites(text, uuid, boolean) to anon, authenticated;
