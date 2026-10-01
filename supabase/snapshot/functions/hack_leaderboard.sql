create or replace function hack_leaderboard(p_challenge_id uuid)
 RETURNS TABLE(rank integer, team_id uuid, team_name text, value numeric, confirmed boolean, is_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c hack_challenge; v_mine uuid; v_all boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from hack_challenge where id = p_challenge_id and status = 'published';
  if not found or v_c.judging_mode <> 'metric' then return; end if;
  v_mine := my_hack_team_id(v_c.edition_id);
  -- Unbestätigte Werte: Hack-Team und Jury dieser Challenge.
  v_all := is_hack_team() or (v_c.org_id is not null and has_role('hackathon_partner') and is_member_of_org(v_c.org_id));
  return query
    select case when r.confirmed_at is not null
                then (rank() over (partition by r.confirmed_at is not null
                                   order by case when v_c.metric_higher_better then -r.value else r.value end))::integer
           end,
           t.id, t.name, r.value, r.confirmed_at is not null, t.id = v_mine
      from hack_metric_result r
      join hack_team t on t.id = r.team_id
     where t.challenge_id = p_challenge_id and t.status <> 'withdrawn'
       and (r.confirmed_at is not null or v_all or t.id = v_mine)
     order by (r.confirmed_at is null), case when v_c.metric_higher_better then -r.value else r.value end, t.name;
end $$;
