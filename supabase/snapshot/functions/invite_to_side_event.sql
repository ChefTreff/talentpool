create or replace function invite_to_side_event(p_side_event_id uuid, p_profile_ids uuid[], p_resend boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_e side_event%rowtype; v_pid uuid; v_sp speaker_profile%rowtype; v_i side_event_invite%rowtype;
  v_token text; v_hash text; v_an uuid; v_n integer; v_mail bigint; v_status text; v_gesendet boolean;
  v_eingeladen integer := 0; v_erneut integer := 0; v_uebersprungen jsonb := '[]'::jsonb; v_ohne_mail jsonb := '[]'::jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_e from side_event where id = p_side_event_id;
  if not found then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_e.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Die Mail nennt Datum und Ort: eine Einladung zu etwas, das noch niemand sehen soll, wäre ein Leck.
  if not v_e.published then raise exception 'side_event_not_published' using errcode = 'P0001'; end if;
  if p_profile_ids is null or cardinality(p_profile_ids) = 0 then
    raise exception 'fields_required' using errcode = '22023', detail = 'profile_ids';
  end if;
  if cardinality(p_profile_ids) > 200 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'profile_ids:' || cardinality(p_profile_ids)::text;
  end if;

  for v_pid in select distinct x from unnest(p_profile_ids) as x loop
    select * into v_sp from speaker_profile where id = v_pid;
    if not found or v_sp.edition_id <> v_e.edition_id or v_sp.stage_guest or not speaker_is_confirmed(v_sp.pipeline_status)
       or not exists (select 1 from person p where p.id = v_sp.person_id and p.deleted_at is null) then
      v_uebersprungen := v_uebersprungen || jsonb_build_object('profile_id', v_pid, 'reason', 'not_eligible');
      continue;
    end if;

    select * into v_i from side_event_invite where side_event_id = p_side_event_id and profile_id = v_pid for update;
    if found then
      if v_i.status <> 'invited' then
        v_uebersprungen := v_uebersprungen || jsonb_build_object('profile_id', v_pid, 'reason', 'answered');
        continue;
      end if;
      if not p_resend then
        v_uebersprungen := v_uebersprungen || jsonb_build_object('profile_id', v_pid, 'reason', 'already_invited');
        continue;
      end if;
    end if;

    -- Token: 32 Zufallsbytes, URL-sicher (43 Zeichen). Gespeichert wird nur der Hash; der Klartext geht ausschliesslich in die Mail.
    v_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    v_hash  := encode(digest(v_token, 'sha256'), 'hex');

    if v_i.profile_id is null then
      insert into side_event_invite (side_event_id, profile_id, status, guests, via, invited_at, invited_by, token_hash, mailed_at)
      values (p_side_event_id, v_pid, 'invited', 0, 'team', now(), v_me, v_hash, now());
      v_eingeladen := v_eingeladen + 1;
    else
      update side_event_invite set token_hash = v_hash, mailed_at = now(), invited_by = v_me
       where side_event_id = p_side_event_id and profile_id = v_pid;
      v_erneut := v_erneut + 1;
    end if;

    -- Die Mail geht an den Empfänger der Speaker-Mails (bei einem verwalteten Speaker an den Kontakt des Partners). Wartet noch eine
    -- Einladung für denselben Empfänger, bekommt **sie** den neuen Token: eine zweite Mail trüge einen schon toten Link.
    v_an := speaker_mail_recipient(v_pid);
    v_gesendet := true;
    update mail_log
       set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{vars,side_event_token}', to_jsonb(v_token), true)
     where template_key = 'side_event_invitation' and related_id = p_side_event_id and person_id = v_an and status = 'queued';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_mail := queue_speaker_mail('side_event_invitation', v_pid, jsonb_build_object(
        'event_title_de', v_e.title_de, 'event_title_en', v_e.title_en,
        'starts_at_de', to_char(v_e.starts_at at time zone 'Europe/Berlin', 'DD.MM.YYYY, HH24:MI "Uhr"'),
        'starts_at_en', to_char(v_e.starts_at at time zone 'Europe/Berlin', 'FMDD Mon YYYY, HH24:MI'),
        'event_location', v_e.location || coalesce(', ' || v_e.address, ''),
        'side_event_token', v_token), 'side_event', p_side_event_id);
      if v_mail is null then
        v_gesendet := false;   -- keine zustellbare Adresse
      else
        select m.status into v_status from mail_log m where m.id = v_mail;
        if v_status is distinct from 'queued' then
          -- Eine unterdrückte Adresse bekommt die Mail nie: der Token hat im Protokoll nichts zu suchen.
          update mail_log set meta = meta #- '{vars,side_event_token}' where id = v_mail;
          v_gesendet := false;
        end if;
      end if;
    end if;
    if not v_gesendet then
      -- Eingeladen ist die Person trotzdem (im Portal sichtbar), aber ohne Link: ein Hash, zu dem es keine Mail gibt, wäre ein
      -- Geheimnis, das niemand kennt. Das Team sieht es in `no_mail` und kann den Stand von Hand setzen.
      update side_event_invite set token_hash = null, mailed_at = null where side_event_id = p_side_event_id and profile_id = v_pid;
      v_ohne_mail := v_ohne_mail || to_jsonb(v_pid);
    end if;

    -- Ins Protokoll gehört die Person, nicht ihre Adresse.
    perform log_audit('side_event.invited', 'side_event', p_side_event_id::text, null,
      jsonb_build_object('person_id', v_sp.person_id, 'resend', v_i.profile_id is not null, 'mailed', v_gesendet));
  end loop;

  return jsonb_build_object('invited', v_eingeladen, 'resent', v_erneut, 'skipped', v_uebersprungen, 'no_mail', v_ohne_mail);
end $$;
