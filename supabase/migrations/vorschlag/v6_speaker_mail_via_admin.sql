-- 00NN · SPK-072: Kommunikation über einen Kontakt im Speaker-Admin setzen oder aufheben
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: SPK-072 (aus PART-091): `speaker_profile.mail_via_contact_id` (0198)
-- setzt heute nur der Partner-Weg (`partner_add_speaker(…, p_verwaltet)`); im
-- Speaker-Admin ließ sich die Umleitung nur aufheben, indem man den Kontakt
-- entfernt. Admin-Vollständigkeit verlangt beides im Admin.
--
-- Neu: `set_speaker_mail_via(profile, contact)` — `contact = null` hebt die
-- Umleitung auf. Recht wie bei den übrigen Team-Entscheidungen am Profil
-- (`is_speaker_team` der Edition). Der Kontakt muss zum Profil gehören und
-- Zugang mit Person haben — sonst liefe die Weiche (`speaker_mail_recipient`,
-- 0200) ohnehin auf die Speakerin zurück, und der Schalter täte so, als ob.
-- Jede Änderung steht im Audit-Log (`speaker.mail_via`, vorher/nachher).
--
-- Neuer Fehlerschlüssel: `contact_without_access` (P0001). `contact_not_found`
-- (P0002) und `speaker_not_found` (P0002) gibt es schon.

set search_path = public, extensions;

create or replace function set_speaker_mail_via(p_profile_id uuid, p_contact_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_c speaker_contact%rowtype;
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_contact_id is not null then
    select * into v_c from speaker_contact c where c.id = p_contact_id and c.profile_id = p_profile_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
    if not v_c.has_access or v_c.person_id is null then
      raise exception 'contact_without_access' using errcode = 'P0001';
    end if;
  end if;
  -- Nichts geändert, nichts zu protokollieren.
  if v_sp.mail_via_contact_id is not distinct from p_contact_id then return p_contact_id; end if;
  update speaker_profile set mail_via_contact_id = p_contact_id where id = p_profile_id;
  perform log_audit('speaker.mail_via', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('mail_via_contact_id', v_sp.mail_via_contact_id),
                    jsonb_build_object('mail_via_contact_id', p_contact_id));
  return p_contact_id;
end $$;

select harden_definer_functions();
