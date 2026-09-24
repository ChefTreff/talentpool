-- 0160 · Welle 6 · Folien mit den Teilnehmenden teilen (SPK-055): set_slides_release mit NULL-sicherer Eigentümerprüfung, nur Präsentationen
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924134337.
-- Vorschlag ohne Nummer · Welle 6 · Folien mit den Teilnehmenden teilen (SPK-055)
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. — „Für Summit Slides freigeben" ist verwirrend; eine
-- klare Abfrage „Nach deinem Slot mit den Teilnehmenden teilen?", am besten als
-- Pop-up nach dem Upload. Die Oberfläche baut das; `set_slides_release` ist der
-- Schreibweg, und der Talent-Chat liest daraus die Teilnehmerseite (TAL-001).
-- Damit dieser Kontrakt hält, braucht die Funktion zwei Korrekturen.
--
-- **1 · Die Eigentümerprüfung liess ein Konto ohne Person durch.** Sie lautete
-- `if v_sp.person_id <> current_person_id() then raise`. Ohne Person ist
-- `current_person_id()` NULL, der Vergleich NULL, und `if NULL` löst nicht aus.
-- **Belegt gegen die Live-Fassung (24.09.):** ein angemeldetes Konto, dessen
-- Person-Verbindung gekappt ist, setzte die Freigabe einer fremden Präsentation
-- auf true — und hätte sie ebenso zurücknehmen können. Anders als die übrigen
-- Speaker-Funktionen mit demselben Vergleich (`submit_expense`,
-- `set_expense_bank_details`, `update_my_speaker_profile`) fehlte hier der
-- frühe Abbruch `if v_me is null`. Lehre aus 0118.
--
-- **2 · Nur Präsentationen.** Die Funktion nahm jede Datei an, auch Fotos und
-- Reisekosten-Belege. Liest die Teilnehmerseite das Häkchen, wäre ein Beleg bei
-- den Teilnehmenden gelandet. Jetzt `not_presentation`.
--
-- Unverändert: nur die Speakerin selbst (nicht die Assistenz), und freigeben
-- verlangt die Einwilligung `slides_publication` („Meine Präsentation darf nach
-- dem Summit geteilt werden"). Zurücknehmen geht immer.
--
-- **Kontrakt mit TAL-001:** freigegeben ist eine Datei genau dann, wenn
-- `speaker_asset.kind = 'presentation'`, `is_current` und `slides_release`.
-- Gezeigt wird sie den Teilnehmenden nach dem Slot und nur bei veröffentlichter
-- Session — das entscheidet die lesende Seite.
--
-- Fehlerschlüssel: P0002 `asset_not_found` · 42501 · P0001 `consent_required` ·
-- 22023 `not_presentation`.

set search_path = public, extensions;

-- ---- set_slides_release (aus dem Snapshot)
create or replace function set_slides_release(p_asset_id uuid, p_release boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a speaker_asset%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_a from speaker_asset where id = p_asset_id for update;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_a.profile_id;
  -- `coalesce`: ohne Person ist der Vergleich NULL, und `if NULL` löst nicht
  -- aus. Genau so ging die Freigabe für ein Konto ohne Person durch — belegt
  -- gegen die Live-Fassung (Kopf dieser Migration). Lehre aus 0118.
  if not coalesce(v_sp.person_id = current_person_id(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Nur Präsentationen. Die Teilnehmerseite (TAL-001) liest freigegebene
  -- Folien; ein Häkchen an einem Foto oder einem Reisekosten-Beleg wäre dort
  -- eine Veröffentlichung, die niemand wollte.
  if v_a.kind <> 'presentation' then
    raise exception 'not_presentation' using errcode = '22023', detail = v_a.kind;
  end if;
  if p_release and not coalesce((select c.granted from consent_current c where c.person_id = v_sp.person_id and c.consent_type = 'slides_publication'), false) then
    raise exception 'consent_required' using errcode = 'P0001', detail = 'slides_publication';
  end if;
  update speaker_asset set slides_release = p_release where id = p_asset_id;
  perform log_audit('speaker.slides_release', 'speaker_asset', p_asset_id::text, null, jsonb_build_object('release', p_release));
end $$;

select harden_definer_functions();
