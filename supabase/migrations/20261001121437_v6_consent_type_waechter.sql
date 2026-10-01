-- 0231 · Einwilligungstyp: Seed-Altwerte privacy_policy → privacy, Vokabular-Wächter auf consent_record
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001121437.
--
-- Zweck: Nebenbefund des Admin-Chats (01.10.): zwei `consent_record`-Zeilen aus dem Seed vom
-- 11.09. tragen `consent_type = 'privacy_policy'`; das Vokabular `consent_type` kennt nur
-- `privacy`. `consent_records_admin` zeigt solche Zeilen ohne Label, und die Frage „liegt die
-- Datenschutz-Einwilligung vor?“ sieht sie nicht. Jetzt: Altwerte umgeschrieben, und ein Wächter
-- nach dem Muster `person_vocab_guard` (v6_profilfelder) lässt künftig nur Schlüssel aus dem
-- Vokabular zu — Fehler 22023 `invalid_vocab_value`, detail `consent_type`. Ein später
-- deaktivierter Begriff blockiert bestehende Zeilen nicht (geprüft wird nur beim Einfügen und
-- beim Ändern des Typs).
--
-- Rechte: der Wächter ist eine Trigger-Funktion (SECURITY DEFINER, search_path gepinnt) und für
-- niemanden direkt aufrufbar. Keine neuen Grants, keine RLS-Änderung, keine Spalten.
-- Fehlerschlüssel: invalid_vocab_value (22023, detail = consent_type).
-- Test: supabase/tests/v6_consent_type_waechter.sql

update consent_record
   set consent_type = 'privacy'
 where consent_type = 'privacy_policy';

create or replace function consent_record_vocab_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if tg_op = 'INSERT' or new.consent_type is distinct from old.consent_type then
    if not is_vocab_key('consent_type', new.consent_type) then
      raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'consent_type';
    end if;
  end if;
  return new;
end $$;

revoke all on function consent_record_vocab_guard() from public, anon, authenticated;

comment on function consent_record_vocab_guard() is
  'Wächter (0231): consent_record.consent_type nur aus dem Vokabular consent_type; 22023 invalid_vocab_value, detail consent_type.';

drop trigger if exists trg_consent_record_vocab_guard on consent_record;
create trigger trg_consent_record_vocab_guard
  before insert or update of consent_type on consent_record
  for each row execute function consent_record_vocab_guard();

select harden_definer_functions();
