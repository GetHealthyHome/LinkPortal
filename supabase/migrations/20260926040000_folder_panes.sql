-- Folders can be shown as a "pane": a frosted-glass window on the home screen
-- that shows its apps directly, instead of a stack you tap to open. Each person
-- chooses per folder. This keeps the folder's "view" setting when a layout is
-- cleaned (it was dropped before).

create or replace function portal_private.clean_layout(p_layout jsonb)
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
        ) || case when v_item->>'view' = 'pane'
                  then jsonb_build_object('view', 'pane') else '{}'::jsonb end);
      end if;
    end if;
  end loop;

  return v_result;
end $$;
