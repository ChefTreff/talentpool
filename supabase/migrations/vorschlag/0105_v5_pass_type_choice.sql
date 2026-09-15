-- =============================================================================
-- 0105 · Welle 5 · Pass-Typ je Partner: vorbelegen und übersteuern
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Offener Punkt aus #42 (Entscheidungslog, 14.09.): `org_edition.pass_type_choice`
-- entscheidet, ob die Talente-Tickets eines Partners als `talent` oder als
-- `startup` in vivenu angelegt werden. Das Feld ist aus der Partneransicht
-- entfernt — und wurde seither von **niemandem** mehr gesetzt. Die Funktion war
-- tot: es gab keine Oberfläche dafür und keinen Weg aus HubSpot.
--
-- Zwei Wege, einer automatisch, einer für den Fall daneben:
--
-- 1. **Vorbelegen beim Anlegen.** Kommt eine Org-Edition neu dazu — das ist im
--    Regelfall der HubSpot-Abgleich —, wird `pass_type_choice` aus der
--    Partnerkategorie der Organisation abgeleitet: `startup` ⇒ `startup`,
--    alles andere ⇒ `talent`.
--
--    Als **Insert**-Trigger, nicht als Update-Trigger, und das ist der Punkt:
--    `NULL` heisst in `effective_pass_type` „nimm den Org-Typ". Würde der
--    Trigger auch bei Änderungen greifen, könnte das Team den Wert nie wieder
--    auf diesen Rückfall stellen — er wäre sofort wieder gesetzt. Vorbelegen
--    heisst vorbelegen, nicht festhalten.
--
--    Der Ingest selbst bleibt unverändert: er schreibt die Spalte nicht, also
--    greift der Trigger, und bei einer bestehenden Zeile (`on conflict do
--    update`) bleibt der gepflegte Wert stehen.
--
-- 2. **Übersteuern durch das Partner-Team.** `set_pass_type_choice()` mit
--    `is_partner_team()`, Prüfung gegen die zwei erlaubten Werte, Audit mit
--    Vorher und Nachher. `null` ist ausdrücklich erlaubt und bedeutet „zurück
--    auf den Rückfall".
--
--    Die Kontingente ziehen von selbst nach: der Trigger aus 0049 ruft
--    `sync_ticket_allocations`, sobald sich `pass_type_choice` ändert. Ein
--    bereits in vivenu angelegtes Kontingent bekommt dadurch einen neuen
--    Pass-Typ — deshalb gibt die RPC zurück, wie viele Kontingente betroffen
--    sind, damit die Oberfläche das benennen kann statt es geschehen zu lassen.
--
-- Der Trigger heisst `trg_org_edition_prefill_pass_type` und nicht wie der
-- bestehende `trg_org_edition_pass_type` aus 0049 — siehe Kommentar unten.
--
-- Fehlerschlüssel: 42501 ohne Recht · 22023 `invalid_pass_type_choice` ·
-- P0002 `org_edition_not_found`.
--
-- Test: supabase/tests/v5_pass_type_choice.sql
-- =============================================================================
set search_path = public, extensions;

/**
 * Vorbelegung aus der Partnerkategorie.
 *
 * Nur wenn nichts angegeben wurde — wer die Spalte beim Anlegen selbst füllt,
 * meint es auch so.
 */
create or replace function org_edition_prefill_pass_type() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.pass_type_choice is null then
    select case when o.partner_category = 'startup' then 'startup' else 'talent' end
      into new.pass_type_choice
      from organization o where o.id = new.org_id;
  end if;
  return new;
end $$;

-- Der Name ist mit Bedacht ein anderer: auf `org_edition` liegt seit 0049
-- bereits `trg_org_edition_pass_type` (after update of pass_type_choice ⇒
-- `sync_ticket_allocations`). Ein gleichnamiger Trigger hätte ihn beim
-- `drop trigger if exists` ersatzlos entfernt — die Kontingente wären einer
-- Änderung nicht mehr gefolgt, ohne dass irgendetwas fehlgeschlagen wäre.
-- Der Smoke-Test hat genau das aufgedeckt (Schritt 09).
drop trigger if exists trg_org_edition_prefill_pass_type on org_edition;
create trigger trg_org_edition_prefill_pass_type before insert on org_edition
  for each row execute function org_edition_prefill_pass_type();

comment on column org_edition.pass_type_choice is
  'talent | startup — Pass-Typ der Talente-Tickets. Beim Anlegen aus organization.partner_category vorbelegt (0105), vom Partner-Team über set_pass_type_choice() änderbar; NULL bedeutet Rückfall auf den Org-Typ (effective_pass_type).';

/**
 * Das Partner-Team setzt den Pass-Typ.
 *
 * Gibt die Zahl der betroffenen Kontingente zurück — die Oberfläche soll sagen
 * können, was die Änderung nach sich zieht, statt sie still auszulösen.
 */
create or replace function set_pass_type_choice(p_org_id uuid, p_choice text, p_edition_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_choice text; v_n integer;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_choice := nullif(btrim(coalesce(p_choice, '')), '');
  if v_choice is not null and v_choice not in ('talent', 'startup') then
    raise exception 'invalid_pass_type_choice' using errcode = '22023', detail = v_choice;
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;

  update org_edition set pass_type_choice = v_choice where id = v_oe.id;

  select count(*)::integer into v_n from org_ticket_allocation a
   where a.org_id = p_org_id and a.event_id = v_oe.edition_id;

  perform log_audit('partner.pass_type_choice', 'org_edition', v_oe.id::text,
                    jsonb_build_object('pass_type_choice', v_oe.pass_type_choice),
                    jsonb_build_object('pass_type_choice', v_choice));
  return jsonb_build_object('pass_type_choice', v_choice, 'allocations', v_n);
end $$;

select harden_definer_functions();
