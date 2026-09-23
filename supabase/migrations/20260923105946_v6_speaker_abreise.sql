-- 0129? · Welle 6 · „Ich möchte weggebracht werden" an der Abreise (SPK-032)
--
-- **Nummer offen.** 0128 ist für SPK-040 (Kontakt zusammenlegen) vorgemerkt;
-- diese hier braucht eine eigene. Vorschlag der Build-Session Speaker-Domäne.
-- Anwenden, Umbenennen und der Eintrag ins Entscheidungslog gehören der
-- Architektur-/Security-Session.
--
-- Anlass: `speaker_travel` kennt seit 0098 `needs_pickup` — den Wunsch, am
-- Bahnhof oder Flughafen abgeholt zu werden. Die Gegenrichtung fehlt. Konrad
-- am 21.09.: „Option für ‚Ich möchte weggebracht werden'". Ohne sie steht die
-- Abreisespalte ohne das eine Feld da, das die Anreisespalte hat, und der
-- Wunsch landet im Freitext, wo ihn keine Liste findet.
--
-- **Ein Feld, kein Objekt.** Eine Abholung ist am Ende eine Shuttle-Fahrt mit
-- Zeit, Ort und Telefonnummer — die steht in `shuttle_booking` und bleibt
-- dort. Was hier steht, ist der **Wunsch**, aus dem eine Fahrt wird; genau so
-- war `needs_pickup` schon gedacht (Kommentar an der Spalte seit 0098).
--
-- Betroffene Funktionen, alle aus `supabase/snapshot/functions/` übernommen:
--   · `my_speaker_travel`     — Lesesicht der Speakerin (+1 Zeile)
--   · `set_my_speaker_travel` — Schreibweg (+2 Zeilen, Muster wie needs_pickup)
--   · `speaker_travel_list`   — Teamliste; Rückgabetyp ändert sich, deshalb
--     drop/create statt replace, mit ausdrücklichen Grants danach.
--
-- Keine Spalten-Grants: `speaker_travel` wird ausschliesslich über diese
-- SECURITY-DEFINER-Funktionen gelesen und geschrieben, `authenticated` hat auf
-- der Tabelle selbst nichts.

alter table speaker_travel
  add column if not exists needs_dropoff boolean not null default false;

comment on column speaker_travel.needs_dropoff is
  'Wunsch, zur Abreise gebracht zu werden. Die Fahrt selbst läuft über shuttle_booking (SPK-032).';

-- ---------------------------------------------------------------- Lesesicht
create or replace function my_speaker_travel(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_t speaker_travel%rowtype;
begin
  v_id := my_speaker_profile_id(p_edition_id);
  if v_id is null then return null; end if;
  select * into v_t from speaker_travel where profile_id = v_id;
  return jsonb_build_object(
    'profile_id', v_id,
    'arrival_date', v_t.arrival_date, 'arrival_time', v_t.arrival_time,
    'arrival_mode', v_t.arrival_mode, 'arrival_ref', v_t.arrival_ref,
    'departure_date', v_t.departure_date, 'departure_time', v_t.departure_time,
    'departure_mode', v_t.departure_mode, 'departure_ref', v_t.departure_ref,
    'needs_pickup', coalesce(v_t.needs_pickup, false),
    'needs_dropoff', coalesce(v_t.needs_dropoff, false), 'note', v_t.note,
    'updated_at', v_t.updated_at);
end $$;

-- --------------------------------------------------------------- Schreibweg
create or replace function set_my_speaker_travel(p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_id uuid; v_owner uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_id := my_speaker_profile_id(p_edition_id);
  if v_id is null then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  insert into speaker_travel (profile_id, arrival_date, arrival_time, arrival_mode, arrival_ref,
                              departure_date, departure_time, departure_mode, departure_ref,
                              needs_pickup, needs_dropoff, note, updated_by)
  values (v_id,
          nullif(p_data->>'arrival_date', '')::date, nullif(p_data->>'arrival_time', '')::time,
          check_travel_mode(p_data->>'arrival_mode'), nullif(btrim(p_data->>'arrival_ref'), ''),
          nullif(p_data->>'departure_date', '')::date, nullif(p_data->>'departure_time', '')::time,
          check_travel_mode(p_data->>'departure_mode'), nullif(btrim(p_data->>'departure_ref'), ''),
          coalesce((p_data->>'needs_pickup')::boolean, false),
          coalesce((p_data->>'needs_dropoff')::boolean, false),
          nullif(btrim(p_data->>'note'), ''), v_me)
  on conflict (profile_id) do update set
    -- Nur überschreiben, was mitgeschickt wurde: das Formular darf einen
    -- Abschnitt speichern, ohne den anderen zu leeren.
    arrival_date    = case when p_data ? 'arrival_date'    then nullif(p_data->>'arrival_date', '')::date    else speaker_travel.arrival_date end,
    arrival_time    = case when p_data ? 'arrival_time'    then nullif(p_data->>'arrival_time', '')::time    else speaker_travel.arrival_time end,
    arrival_mode    = case when p_data ? 'arrival_mode'    then check_travel_mode(p_data->>'arrival_mode')   else speaker_travel.arrival_mode end,
    arrival_ref     = case when p_data ? 'arrival_ref'     then nullif(btrim(p_data->>'arrival_ref'), '')    else speaker_travel.arrival_ref end,
    departure_date  = case when p_data ? 'departure_date'  then nullif(p_data->>'departure_date', '')::date  else speaker_travel.departure_date end,
    departure_time  = case when p_data ? 'departure_time'  then nullif(p_data->>'departure_time', '')::time  else speaker_travel.departure_time end,
    departure_mode  = case when p_data ? 'departure_mode'  then check_travel_mode(p_data->>'departure_mode') else speaker_travel.departure_mode end,
    departure_ref   = case when p_data ? 'departure_ref'   then nullif(btrim(p_data->>'departure_ref'), '')  else speaker_travel.departure_ref end,
    needs_pickup    = case when p_data ? 'needs_pickup'    then coalesce((p_data->>'needs_pickup')::boolean, false) else speaker_travel.needs_pickup end,
    needs_dropoff   = case when p_data ? 'needs_dropoff'   then coalesce((p_data->>'needs_dropoff')::boolean, false) else speaker_travel.needs_dropoff end,
    note            = case when p_data ? 'note'            then nullif(btrim(p_data->>'note'), '')           else speaker_travel.note end,
    updated_by      = v_me,
    updated_at      = now();

  -- Die Assistenz darf pflegen; dass sie es war, steht danach im Protokoll.
  select sp.person_id into v_owner from speaker_profile sp where sp.id = v_id;
  if v_owner <> v_me then
    perform log_audit('speaker.travel_assistant', 'speaker_profile', v_id::text, null, p_data);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- Teamliste
-- Der Rückgabetyp bekommt eine Spalte, deshalb drop/create. Die Rechte danach
-- ausdrücklich setzen — ein `drop` nimmt die Grants mit.
drop function if exists speaker_travel_list(uuid);

create function speaker_travel_list(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, first_name text, last_name text, job_title text, organization_name text, pipeline_status text, owner_person_id uuid, owner_name text, arrival_date date, arrival_time time without time zone, arrival_mode text, arrival_ref text, departure_date date, departure_time time without time zone, departure_mode text, departure_ref text, needs_pickup boolean, needs_dropoff boolean, note text, hotel_label text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker')
          or has_role('programme_team') or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, sp.job_title, sp.organization_name,
           sp.pipeline_status, sp.owner_person_id,
           (select btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
              from person o where o.id = sp.owner_person_id),
           t.arrival_date, t.arrival_time, t.arrival_mode, t.arrival_ref,
           t.departure_date, t.departure_time, t.departure_mode, t.departure_ref,
           coalesce(t.needs_pickup, false), coalesce(t.needs_dropoff, false), t.note,
           (select q.label_de from hospitality_booking b join hospitality_quota q on q.id = b.quota_id
             where b.profile_id = sp.id and b.kind = 'hotel' and b.status = 'confirmed'
             order by b.confirmed_at desc limit 1),
           t.updated_at
      from speaker_profile sp
      join person p on p.id = sp.person_id and p.deleted_at is null
      left join speaker_travel t on t.profile_id = sp.id
     where (p_edition_id is null or sp.edition_id = p_edition_id)
       -- Die Produktion braucht die Liste, ohne je Speaker zuständig zu sein.
       and (is_production_team() or can_manage_speaker(sp.id))
     order by t.arrival_date nulls last, t.arrival_time nulls last,
              p.last_name nulls last, p.first_name nulls last;
end $$;

revoke all on function speaker_travel_list(uuid) from public, anon;
grant execute on function speaker_travel_list(uuid) to authenticated;

select harden_definer_functions();
