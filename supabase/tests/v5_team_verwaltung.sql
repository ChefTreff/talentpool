-- Smoke-Test 0106 (Team als Liste), seit ADM-094 nur noch die Rollenliste. Belegt:
--   08 `team_role_keys` enthält keine Teilnehmerrollen.
-- Die Teamliste selbst (`team_members()`) ist entfallen: `team_access_list` ersetzt sie, ihre Fälle (Scope als Name,
-- Teilnehmerrollen zählen nicht, abgelaufene Rollen, eine Zeile je Person, Konto ja/nein, Zahl der Admins, Rechte)
-- stehen in `v6_team_access_list.sql`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
begin
  -- 08 · Die Liste der Teamrollen.
  insert into t_res values ('08_rollenliste',
    case when not (team_role_keys() && array['talent', 'speaker', 'partner_contact', 'volunteer',
                                             'hackathon_participant', 'speaker_assistant', 'standbuehne_editor'])
          and team_role_keys() && array['admin']
         then 'keine Teilnehmerrollen (richtig)'
         else 'unerwartet ' || array_to_string(team_role_keys(), ',') end);
end $$;
select * from t_res order by step;
rollback;
