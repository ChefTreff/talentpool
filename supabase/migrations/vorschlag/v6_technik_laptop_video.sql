-- Vorschlag ohne Nummer · Welle 6 · Laptop und Video mit Ton in der Technik (SPK-067)
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. — unter Session → Technik die Felder „Ich bringe
-- meinen eigenen Laptop mit" und „Ich zeige Video mit Ton" ergänzen, „die Infos
-- sind wichtig" (Regie).
--
-- `session.tech` nimmt nur Schlüssel aus `session_tech_keys()` an; zwei neue
-- kommen dazu. **Als Wahrheitswert, nicht als Text:** `update_session_tech`
-- las jeden Wert als Text (`value #>> '{}'`), ein Häkchen wäre als `"true"`
-- gespeichert worden. Jetzt `true`, und nur das Ja — ein Nein fällt heraus wie
-- ein leeres Feld.
--
-- **Die Regie bekommt die Felder ohne Umbau**: `regie_view` gibt `session.tech`
-- als Ganzes heraus. Ihre Anzeige rechnete aber mit Text (`v.trim()`) und wäre
-- an einem Wahrheitswert gescheitert — die Oberfläche wächst im selben PR mit.
--
-- Beide Funktionen aus `supabase/snapshot/functions/`.
--
-- Fehlerschlüssel: zusätzlich 22023 `invalid_tech_value`.

set search_path = public, extensions;

-- ---- session_tech_keys
create or replace function session_tech_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select array['microphone', 'special_requirements', 'own_laptop', 'video_with_sound']::text[]
$$;

-- ---- update_session_tech
create or replace function update_session_tech(p_session_id uuid, p_tech jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_key text; v_val text;
  v_neu jsonb := '{}'::jsonb; v_alt jsonb; v_rider jsonb; v_person uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from session s where s.id = p_session_id) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- Speaker der Session, oder die Assistenz eines solchen Speakers.
  select ss.person_id into v_person
    from session_speaker ss
    join speaker_profile sp on sp.person_id = ss.person_id
   where ss.session_id = p_session_id
     and (ss.person_id = v_me or is_speaker_assistant(sp.id, v_me))
   limit 1;
  if v_person is null then raise exception 'not allowed' using errcode = '42501'; end if;

  if p_tech is null or jsonb_typeof(p_tech) <> 'object' then
    raise exception 'invalid_tech_key' using errcode = '22023', detail = 'object_required';
  end if;

  for v_key, v_val in select key, value #>> '{}' from jsonb_each(p_tech) loop
    if not (v_key = any (session_tech_keys())) then
      raise exception 'invalid_tech_key' using errcode = '22023', detail = v_key;
    end if;
    -- Zwei Häkchen (SPK-067): eigener Laptop, Video mit Ton. Gespeichert wird
    -- ein echter Wahrheitswert, und zwar nur das Ja — ein Nein fällt heraus wie
    -- ein leeres Feld, sonst stünde in der Regie „Laptop: nein" als Angabe da.
    -- Als Text gespeichert hiesse `"true"`, und die Regie hätte es als Wort
    -- angezeigt.
    if v_key in ('own_laptop', 'video_with_sound') then
      if v_val is not null and v_val not in ('true', 'false') then
        raise exception 'invalid_tech_value' using errcode = '22023', detail = v_key;
      end if;
      if v_val = 'true' then
        v_neu := v_neu || jsonb_build_object(v_key, true);
      end if;
      continue;
    end if;
    v_val := nullif(btrim(coalesce(v_val, '')), '');
    if v_val is not null and length(v_val) > 500 then
      raise exception 'tech_too_long' using errcode = '22023', detail = v_key;
    end if;
    -- Das Mikrofon ist seit dem 22.09. eine Auswahl, kein Freitext mehr.
    if v_key = 'microphone' and v_val is not null
       and not is_vocab_key('speaker_microphone', v_val) then
      raise exception 'invalid_microphone' using errcode = '22023', detail = v_val;
    end if;
    -- Leere Felder fallen heraus, statt als "" zu bleiben: sonst steht später
    -- in der Regie eine leere Zeile, die wie eine Angabe aussieht.
    if v_val is not null then
      v_neu := v_neu || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  select s.tech into v_alt from session s where s.id = p_session_id;

  -- Vorbelegung aus dem Rider, aber nur beim **ersten** Mal und nur für
  -- Schlüssel, die die Eingabe nicht selbst setzt. Das Mikrofon ist hier
  -- bewusst raus (siehe Kopf).
  if coalesce(v_alt, '{}'::jsonb) = '{}'::jsonb then
    select sp.tech_rider into v_rider from speaker_profile sp where sp.person_id = v_person limit 1;
    if v_rider is not null and jsonb_typeof(v_rider) = 'object' then
      if not (v_neu ? 'special_requirements')
         and nullif(btrim(coalesce(v_rider->>'notes', '')), '') is not null then
        v_neu := v_neu || jsonb_build_object('special_requirements', btrim(v_rider->>'notes'));
      end if;
    end if;
  end if;

  update session set tech = v_neu, updated_at = now(), updated_by = v_me where id = p_session_id;

  -- Nur die **Schlüssel** ins Protokoll, nicht die Werte: was ein Speaker an
  -- besonderen Anforderungen schreibt, kann persönlich sein (dieselbe Regel wie
  -- bei der Ernährung, 0100).
  perform log_audit('speaker.session_tech', 'session', p_session_id::text,
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(coalesce(v_alt, '{}'::jsonb)) k)),
    jsonb_build_object('keys', (select coalesce(array_agg(k), array[]::text[])
                                  from jsonb_object_keys(v_neu) k)));

  return v_neu;
end $$;

select harden_definer_functions();
