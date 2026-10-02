create or replace function answer_hack_request(p_request_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_r hack_join_request; v_n integer; v_t hack_team;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_r from hack_join_request where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Antworten darf die Gegenseite: Kapitän bei einer Anfrage ans Team, die Person bei einer Einladung.
  if not ((v_r.direction = 'to_team' and hack_is_captain(v_r.team_id))
          or (v_r.direction = 'to_person' and v_r.person_id = v_me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_r.status <> 'pending' then raise exception 'request_closed' using errcode = 'P0001'; end if;

  if coalesce(p_accept, false) then
    -- Alle Regeln von join_hack_team noch einmal, unter Zeilensperre auf Team und Bewerbung:
    -- zwei gleichzeitige Zusagen warten aufeinander und sehen danach den neuen Stand.
    select * into v_t from hack_team where id = v_r.team_id for update;
    if not found or v_t.status = 'withdrawn' then raise exception 'team_not_found' using errcode = 'P0002'; end if;
    perform 1 from hack_application a where a.person_id = v_r.person_id and a.edition_id = v_r.edition_id for update;
    if exists (select 1 from hack_team_member m where m.person_id = v_r.person_id and m.edition_id = v_r.edition_id) then
      raise exception 'already_in_team' using errcode = 'P0001';
    end if;
    -- Anfrage ans Team gilt nur, solange das Team sucht; eine Einladung nur, solange die Person
    -- eine angenommene Bewerbung hat.
    if v_r.direction = 'to_team' and not v_t.looking then
      raise exception 'team_not_looking' using errcode = 'P0001';
    end if;
    if not exists (select 1 from hack_application a where a.person_id = v_r.person_id
                    and a.edition_id = v_r.edition_id and a.status = 'accepted') then
      raise exception 'not_participant' using errcode = '42501';
    end if;
    select count(*) into v_n from hack_team_member where team_id = v_r.team_id;
    if v_n >= 8 then raise exception 'team_full' using errcode = 'P0001', detail = '8'; end if;
    insert into hack_team_member (team_id, person_id, edition_id) values (v_r.team_id, v_r.person_id, v_r.edition_id);
    update hack_application set team_id = v_r.team_id, seeking_team = false
     where person_id = v_r.person_id and edition_id = v_r.edition_id;
    update hack_join_request set status = 'accepted', decided_by = v_me, decided_at = now() where id = v_r.id;
    -- Übrige offene Anfragen der Person sind erledigt.
    update hack_join_request set status = 'withdrawn', decided_at = now()
     where person_id = v_r.person_id and edition_id = v_r.edition_id and status = 'pending' and id <> v_r.id;
    perform log_audit('hack.join_accepted', 'hack_team', v_r.team_id::text, null, jsonb_build_object('request_id', v_r.id));
  else
    update hack_join_request set status = 'declined', decided_by = v_me, decided_at = now() where id = v_r.id;
    perform log_audit('hack.join_declined', 'hack_team', v_r.team_id::text, null, jsonb_build_object('request_id', v_r.id));
  end if;
end $$;
