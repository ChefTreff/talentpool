-- ???? · Welle 6 · Hochgeladene Folien wieder entfernen (SPK-028)
--
-- **Nummer offen.** 0128 ist für SPK-040 vorgemerkt; `v6_speaker_abreise`
-- (SPK-032) und diese hier brauchen je eine eigene. Vorschlag der
-- Build-Session Speaker-Domäne; Anwenden, Umbenennen und der Eintrag ins
-- Entscheidungslog gehören der Architektur-/Security-Session.
--
-- Anlass: Konrad am 21.09.: „Außerdem sollte man Slides wieder löschen
-- können." Bisher gibt es nur `register_speaker_asset` — wer die falsche Datei
-- hochlädt, kann sie überschreiben, aber nicht loswerden; die alte Fassung
-- bleibt als Version stehen und taucht in der Technik-Prüfung auf.
--
-- **Nur Präsentationen.** Fotos ersetzen sich über den Profil-Upload, Belege
-- hängen an einem Auslagenantrag und dürfen nach dem Einreichen nicht
-- verschwinden. Ein allgemeines „lösch irgendein Asset" wäre eine grössere
-- Zusage, als die Sache braucht.
--
-- **Die vorige Fassung wird wieder die aktuelle.** Wer Version 3 entfernt,
-- steht sonst ohne Präsentation da, obwohl Version 2 noch im Bucket liegt —
-- und die Technik sähe „nichts eingereicht", was nicht stimmt.
--
-- Die Datei im Bucket entfernt der Aufrufer selbst: die Policy
-- `speaker assets delete` erlaubt es über `speaker_asset_path_allowed`.
-- Deshalb gibt die Funktion den Pfad zurück. Erst die Zeile, dann die Datei —
-- andersherum bliebe ein Eintrag stehen, der ins Leere zeigt.

create or replace function delete_speaker_asset(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id();
  v_a speaker_asset%rowtype;
  v_sp speaker_profile%rowtype;
  v_naechste uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into v_a from speaker_asset where id = p_id;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;

  select * into v_sp from speaker_profile where id = v_a.profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Dieselbe Prüfung wie beim Hochladen. `coalesce` ist hier keine Zierde:
  -- ohne hinterlegte Assistenz wäre `v_sp.assistant_person_id = v_me` NULL und
  -- die ganze Kette NULL statt false (Hotfix 0118).
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me
                   or can_manage_speaker(v_a.profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_a.kind <> 'presentation' then
    raise exception 'kind_not_deletable' using errcode = '22023', detail = v_a.kind;
  end if;

  delete from speaker_asset where id = p_id;

  -- War es die aktuelle Fassung, rückt die höchste verbliebene Version nach.
  if v_a.is_current then
    select a.id into v_naechste
      from speaker_asset a
     where a.profile_id = v_a.profile_id and a.kind = v_a.kind
       and coalesce(a.session_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_a.session_id, '00000000-0000-0000-0000-000000000000'::uuid)
     order by a.version desc limit 1;
    if v_naechste is not null then
      update speaker_asset set is_current = true where id = v_naechste;
    end if;
  end if;

  perform log_audit('speaker.asset_deleted', 'speaker_profile', v_a.profile_id::text, null,
    jsonb_build_object('asset_id', p_id, 'kind', v_a.kind, 'version', v_a.version,
                       'session_id', v_a.session_id, 'restored', v_naechste));
  return v_a.storage_path;
end $$;

revoke all on function delete_speaker_asset(uuid) from public, anon;
grant execute on function delete_speaker_asset(uuid) to authenticated;

select harden_definer_functions();
