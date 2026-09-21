create or replace function my_hack(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_app hack_application; v_team hack_team;
        v_sub hack_submission; v_ch hack_challenge;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  select * into v_app from hack_application where person_id = v_me and edition_id = v_ed;
  select t.* into v_team from hack_team t join hack_team_member m on m.team_id = t.id
   where m.person_id = v_me and t.edition_id = v_ed;
  if v_team.id is not null then
    select * into v_sub from hack_submission where team_id = v_team.id;
    select * into v_ch from hack_challenge where id = v_team.challenge_id;
  end if;

  return jsonb_build_object(
    'edition_id', v_ed,
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'skills', to_jsonb(v_app.skills),
      'motivation', v_app.motivation, 'team_pref', v_app.team_pref, 'applied_at', v_app.applied_at) end,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'status', v_team.status,
      -- Den Beitrittscode sieht nur, wer schon drin ist.
      'join_code', v_team.join_code, 'discord_url', v_team.discord_url,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'person_id', p.id, 'name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    'is_captain', m.is_captain) order by m.joined_at), '[]'::jsonb)
                  from hack_team_member m join person p on p.id = m.person_id where m.team_id = v_team.id)) end,
    'challenge', case when v_ch.id is null then null else jsonb_build_object(
      'id', v_ch.id, 'title', hack_text(v_ch.title_de, v_ch.title_en, p_language),
      'description', hack_text(v_ch.description_de, v_ch.description_en, p_language),
      'prizes', v_ch.prizes, 'resources', v_ch.resources, 'criteria', v_ch.criteria) end,
    'submission', case when v_sub.id is null then null else jsonb_build_object(
      'url', v_sub.url, 'repo_url', v_sub.repo_url, 'notes', v_sub.notes,
      'submitted_at', v_sub.submitted_at) end);
end $$;
