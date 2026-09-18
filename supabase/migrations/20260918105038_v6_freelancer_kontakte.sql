-- =============================================================================
-- 0114 · Welle 6 · Freelancer als Ansprechpersonen (ADM-040, D7)
--
-- Angewendet von der Architektur-Session am 18.09.2026 als 20260918105038.
--
-- Konrad am 17.09. zu D7: „Die Regel bitte lockern."
--
-- Bisher liess `edition_contact_email_chk` nur Adressen auf `@chef-treff.de`
-- zu. Speaker-Buddys sind teils Freelancer ohne Hausadresse; die Regel machte
-- sie unerfassbar, und die Speaker-Startseite blieb ohne Ansprechperson.
--
-- **Was dabei verloren geht, gehört benannt:** dieser CHECK war die einzige
-- technische Sperre dagegen, dass private Kontaktdaten Dritter im Portal
-- landen. An seine Stelle tritt `contract_consent_at` — ein Datum, das die
-- Redaktion setzt. Das ist eine **Selbstauskunft**: es belegt nicht, dass die
-- Einwilligung im Vertrag steht, es bezeugt, dass jemand sie bestätigt hat.
-- Deshalb zwei Dinge:
--
-- * Der Hilfetext am Feld sagt es unmissverständlich („Nur mit ausdrücklicher
--   Einwilligung im Vertrag. Das Datum ist der Nachweis, dass sie vorliegt.").
-- * Das Setzen steht mit Akteur im Audit-Log — wer bestätigt hat, ist später
--   nachvollziehbar.
--
-- Die Sperre ersetzt den Vertrag nicht. Sie verhindert, dass jemand die Regel
-- **versehentlich** übergeht.
--
-- **Widerruf heisst entfernen, nicht leeren.** Ein leeres Datum bei fremder
-- Adresse verletzt den CHECK; die Zeile liesse sich gar nicht speichern.
-- `edition_contact` kennt kein `active`, und alle Verweise stehen auf
-- `on delete set null` — `my_contacts()` fällt dann auf den Standardkontakt
-- zurück. Löschen ist also der saubere Weg, und `delete_edition_contact` gibt
-- den Bildpfad zurück, damit die Serverroute das Foto mitnimmt.
--
-- Beim Widerruf stehen `email` und `phone` **nicht** im Protokoll: sie sind
-- genau das, wofür die Einwilligung zurückgezogen wurde. `id`, `type` und
-- `display_name` reichen als Nachweis.
--
-- Fehlerschlüssel: 42501 ohne Recht · 22023 `contact_consent_required` (fremde Adresse
-- ohne Einwilligungsdatum) · 22023 `invalid_contact_type` · 22023
-- `fields_required` · P0002 `contact_not_found`.
--
-- Test: supabase/tests/v6_freelancer_kontakte.sql
-- =============================================================================
set search_path = public, extensions;

alter table edition_contact add column if not exists contract_consent_at date;
comment on column edition_contact.contract_consent_at is
  'Datum der vertraglichen Einwilligung, die Kontaktdaten im Portal zu zeigen (0114). Pflicht bei Adressen ausserhalb @chef-treff.de. Selbstauskunft der Redaktion, kein Nachweis — das Setzen steht mit Akteur im Audit-Log.';

alter table edition_contact drop constraint if exists edition_contact_email_chk;
alter table edition_contact add constraint edition_contact_email_chk
  check (lower(email::text) like '%@chef-treff.de' or contract_consent_at is not null);

/**
 * Ansprechperson anlegen oder ändern.
 *
 * Wie die Live-Fassung, mit einer Änderung: statt jede fremde Adresse
 * abzuweisen, verlangt sie bei einer fremden Adresse das Einwilligungsdatum.
 * Der eigene Schlüssel `contact_consent_required` ist wichtig — eine CHECK-Verletzung
 * käme als nackte 23514 in der Oberfläche an, und niemand wüsste, was zu tun
 * ist.
 */
create or replace function upsert_edition_contact(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid; v_typ text; v_mail text; v_consent date; v_mail_effektiv text;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  v_mail := nullif(btrim(p_data->>'email'), '');
  v_consent := nullif(p_data->>'contract_consent_at', '')::date;

  -- Welche Adresse gilt am Ende, und welches Datum? Beim Ändern zählt der
  -- bestehende Stand, wenn das Feld nicht mitgeschickt wird — sonst würde eine
  -- reine Namenskorrektur an der Einwilligung scheitern.
  if v_id is not null then
    select coalesce(v_mail, c.email::text),
           case when p_data ? 'contract_consent_at' then v_consent else c.contract_consent_at end
      into v_mail_effektiv, v_consent
      from edition_contact c where c.id = v_id;
  else
    v_mail_effektiv := v_mail;
  end if;

  if v_mail_effektiv is not null
     and lower(v_mail_effektiv) not like '%@chef-treff.de'
     and v_consent is null then
    raise exception 'contact_consent_required' using errcode = '22023', detail = v_mail_effektiv;
  end if;

  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;

  -- **Erst umhängen, dann schreiben.** Der Teilindex `edition_contact_default_uidx`
  -- duldet keinen zweiten Standard je Edition und Typ — auch nicht für die
  -- Dauer einer Anweisung.
  if coalesce((p_data->>'is_default')::boolean, false) then
    update edition_contact set is_default = false, updated_at = now()
     where edition_id = v_ed
       and type = coalesce(v_typ, (select c.type from edition_contact c where c.id = v_id))
       and is_default
       and (v_id is null or id <> v_id);
  end if;

  if v_id is null then
    if v_typ is null or nullif(btrim(p_data->>'display_name'), '') is null
       or v_mail is null or nullif(btrim(p_data->>'phone'), '') is null then
      raise exception 'fields_required' using errcode = '22023',
        detail = 'type, display_name, email und phone sind Pflicht';
    end if;
    insert into edition_contact (edition_id, type, display_name, role_label_de, role_label_en,
                                 email, phone, photo_path, is_default, sort_order, contract_consent_at)
    values (v_ed, v_typ, btrim(p_data->>'display_name'),
            nullif(btrim(p_data->>'role_label_de'), ''), nullif(btrim(p_data->>'role_label_en'), ''),
            v_mail::citext, btrim(p_data->>'phone'),
            nullif(btrim(p_data->>'photo_path'), ''),
            coalesce((p_data->>'is_default')::boolean, false),
            coalesce((p_data->>'sort_order')::integer, 0), v_consent)
    returning id into v_id;
  else
    update edition_contact set
      type          = coalesce(v_typ, type),
      display_name  = coalesce(nullif(btrim(p_data->>'display_name'), ''), display_name),
      role_label_de = case when p_data ? 'role_label_de' then nullif(btrim(p_data->>'role_label_de'), '') else role_label_de end,
      role_label_en = case when p_data ? 'role_label_en' then nullif(btrim(p_data->>'role_label_en'), '') else role_label_en end,
      email         = coalesce(v_mail::citext, email),
      phone         = coalesce(nullif(btrim(p_data->>'phone'), ''), phone),
      photo_path    = case when p_data ? 'photo_path' then nullif(btrim(p_data->>'photo_path'), '') else photo_path end,
      is_default    = coalesce((p_data->>'is_default')::boolean, is_default),
      sort_order    = coalesce((p_data->>'sort_order')::integer, sort_order),
      contract_consent_at = case when p_data ? 'contract_consent_at' then v_consent else contract_consent_at end,
      updated_at    = now()
     where id = v_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;

  perform log_audit('edition_contact.upsert', 'edition_contact', v_id::text, null, p_data - 'photo_path');
  return v_id;
end $$;

/**
 * Ansprechperson entfernen — und beim Widerruf sagen, warum.
 *
 * Gibt den Bildpfad zurück: das Foto liegt im Bucket und muss mit, sonst bleibt
 * das Gesicht einer Person im Portal, die gerade ihre Einwilligung
 * zurückgezogen hat. Die Serverroute räumt es weg.
 */
drop function if exists delete_edition_contact(uuid);
create or replace function delete_edition_contact(p_id uuid, p_reason text default null) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb; v_photo text;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(c), c.photo_path into v_before, v_photo from edition_contact c where c.id = p_id;
  if v_before is null then raise exception 'contact_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  delete from edition_contact where id = p_id;
  -- **Beim Widerruf keine Kontaktdaten ins Protokoll.** Sonst überlebten genau
  -- die Angaben, für die die Einwilligung zurückgezogen wurde, ihre Löschung im
  -- Audit-Log. `id`, `type` und `display_name` reichen als Nachweis, dass diese
  -- Zeile entfernt wurde (Auflage der Architektur-Session, 18.09.).
  perform log_audit(case when p_reason = 'consent_withdrawn' then 'contact.remove' else 'edition_contact.delete' end,
                    'edition_contact', p_id::text,
                    case when p_reason = 'consent_withdrawn'
                         then v_before - 'photo_path' - 'email' - 'phone'
                         else v_before - 'photo_path' end,
                    jsonb_build_object('reason', coalesce(p_reason, 'deleted')));
  return v_photo;
end $$;

/**
 * Die Pflegeliste nennt das Einwilligungsdatum mit.
 *
 * Rückgabetyp ändert sich, deshalb drop + create. Übernommen von der
 * **Live-Fassung** (db-konventionen §1), nicht von der einführenden Migration.
 */
drop function if exists edition_contacts_admin(uuid);
create or replace function edition_contacts_admin(p_edition_id uuid default null)
returns table (id uuid, type text, display_name text, role_label_de text, role_label_en text,
               email text, phone text, photo_path text, is_default boolean, sort_order integer,
               contract_consent_at date, orgs integer, speakers integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select c.id, c.type, c.display_name, c.role_label_de, c.role_label_en, c.email::text, c.phone,
           c.photo_path, c.is_default, c.sort_order, c.contract_consent_at,
           (select count(*)::integer from org_edition oe
             where oe.lead_contact_id = c.id or oe.buddy_contact_id = c.id),
           (select count(*)::integer from speaker_profile sp
             where sp.lead_contact_id = c.id or sp.buddy_contact_id = c.id)
      from edition_contact c
     where c.edition_id = v_ed
     order by c.type, c.sort_order, c.display_name;
end $$;

select harden_definer_functions();
