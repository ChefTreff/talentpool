create or replace function publish_hack_challenge(p_deliverable_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_d deliverable; v_oe org_edition; v_a jsonb; v_id uuid; v_crit jsonb := '[]'::jsonb; i integer;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_d from deliverable where id = p_deliverable_id;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  v_a := coalesce(v_d.answers, '{}'::jsonb);

  -- Vier Kriterien als feste Felder: die Formular-Engine kennt keine
  -- Wiederholgruppen. Leere Zeilen fallen weg.
  for i in 1..4 loop
    if nullif(btrim(coalesce(v_a->>('criterion_' || i || '_label'), '')), '') is not null then
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'key', 'c' || i,
        'label', v_a->>('criterion_' || i || '_label'),
        'weight', coalesce((v_a->>('criterion_' || i || '_weight'))::numeric, 25)));
    end if;
  end loop;

  insert into hack_challenge (edition_id, org_id, deliverable_id, title_en, title_de,
                              description_en, description_de, prizes, resources, mentors, criteria, status)
  values (v_oe.edition_id, v_oe.org_id, p_deliverable_id,
          coalesce(nullif(btrim(v_a->>'title_en'), ''), nullif(btrim(v_a->>'title'), ''), 'Challenge'),
          nullif(btrim(v_a->>'title_de'), ''),
          nullif(btrim(v_a->>'description_en'), ''), nullif(btrim(v_a->>'description_de'), ''),
          nullif(btrim(v_a->>'prizes'), ''), nullif(btrim(v_a->>'resources'), ''),
          -- Mentoren aus dem Formular: eine Zeile je Person („Name, Rolle").
          coalesce(v_a->'mentors',
                   case when nullif(btrim(coalesce(v_a->>'mentor_names', '')), '') is not null
                        then to_jsonb(array_remove(regexp_split_to_array(btrim(v_a->>'mentor_names'), '\s*\n\s*'), ''))
                        else '[]'::jsonb end),
          v_crit, 'published')
  on conflict (deliverable_id) do update set
    title_en = excluded.title_en, title_de = excluded.title_de,
    description_en = excluded.description_en, description_de = excluded.description_de,
    prizes = excluded.prizes, resources = excluded.resources,
    mentors = excluded.mentors, criteria = excluded.criteria,
    status = 'published', updated_at = now()
  returning id into v_id;

  perform log_audit('hack.challenge_published', 'hack_challenge', v_id::text, null, null);
  return v_id;
end $$;
