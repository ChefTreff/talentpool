-- Vorschlag · Welle 6 · Tour-Leads im Company-Tours-Abschnitt pflegen (ADM-059)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad zur neuen Sektion — „sieht super aus", und: die **Begleitung vor Ort** soll
-- direkt dort anzulegen und zu bearbeiten sein. Wer nur diesen Abschnitt hat, muss alles
-- bearbeiten koennen, was zur Tour gehoert: Touren, Stopps, Begleitung, Session-Verknuepfung.
--
-- **Keine zweite Tabelle.** Die Begleitung gibt es schon: `edition_contact` mit `type = 'tour_lead'`
-- — Name, dienstliche Adresse, Telefon, Foto, `contract_consent_at`, kein Konto, keine Rolle.
-- `company_tour.lead_contact_id` zeigt bereits darauf, `check_edition_contact(..., 'tour_lead')`
-- erzwingt den Typ, und das Partner-Portal zeigt die Person als „Euer Tour Lead". Eine eigene
-- Tabelle je Tour braeche diesen Anzeigeweg oder verdoppelte ihn und legte die Telefonnummer an
-- einen zweiten Ort — schlechter fuer die Datenminimierung, nicht besser. Entscheidung der
-- Architektur-Session am 25.09.
--
-- **Die Luecke war das Schreibrecht**, nicht das Datenmodell: `upsert_edition_contact` verlangt
-- `can_edit_edition_contacts()` = `admin`, `area_lead_partner`, `area_lead_speaker`. Wer nur
-- `companyTours` hat, kam nicht durch.
--
-- Deshalb **eine** Erweiterung des Gates statt einer zweiten Funktion: die Regeln — Pflichtfelder,
-- Einwilligung bei fremder Adresse, Eindeutigkeit des Standards — stehen weiter genau einmal.
-- Eine Zweitfunktion mit denselben Pruefungen waere die naechste Abschrift, die auseinanderlaeuft.
--
-- **Der wirksame Typ entscheidet, und der bisherige zaehlt mit.** Sonst koennte jemand mit nur
-- diesem Abschnitt eine Begleitung anlegen und sie danach in einen Speaker-Buddy verwandeln — ueber
-- den Umweg also genau das pflegen, was ihm verwehrt ist. Der Test geht diesen Umweg ab.
--
-- E-Mail bleibt **Pflicht und dienstlich** (Serviceversprechen: die Kontaktdaten stehen im
-- Partner-Portal); der CHECK wird nicht gelockert, eine fremde Adresse braucht weiter
-- `contract_consent_at`. Keine `person_id`: Tour-Leads haben kein Konto, der Name genuegt.
--
-- Dazu liefert `company_tour_options` die Begleitungen jetzt mit den Feldern, die der Editor
-- braucht — dieselbe Runde, dieselbe Rechtepruefung.
-- Basis: `supabase/snapshot/functions/upsert_edition_contact.sql`, `company_tour_options.sql`
-- (Konvention §1). Test: `supabase/tests/v6_tour_leads.sql`.

-- 1 · Schreibrecht fuer Begleitungen, eng gefasst
create or replace function upsert_edition_contact(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_ed uuid; v_typ text; v_mail text; v_consent date; v_mail_effektiv text;
        v_typ_alt text; v_typ_wirksam text;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy','tour_lead') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  -- ADM-059: Wer nur den Abschnitt „Company Tours" hat, darf **Begleitungen**
  -- pflegen und sonst nichts. Die Regeln dafuer (Pflichtfelder, Einwilligung bei
  -- fremder Adresse, Standard-Eindeutigkeit) stehen genau einmal — hier —, statt
  -- in einer zweiten Funktion daneben, wo sie auseinanderlaufen wuerden.
  --
  -- Der **wirksame** Typ zaehlt: beim Aendern der bestehende, wenn keiner
  -- mitkommt. Und der bisherige muss ebenfalls `tour_lead` sein — sonst koennte
  -- jemand eine Begleitung anlegen und sie danach in einen Speaker-Buddy
  -- verwandeln, also ueber den Umweg genau das pflegen, was ihm verwehrt ist.
  if v_id is not null then
    select c.type into v_typ_alt from edition_contact c where c.id = v_id;
  end if;
  v_typ_wirksam := coalesce(v_typ, v_typ_alt);
  if not can_edit_edition_contacts() then
    if not (coalesce(has_admin_section('companyTours'), false)
            and v_typ_wirksam = 'tour_lead'
            and (v_id is null or v_typ_alt = 'tour_lead')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
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

-- 2 · Die Auswahlliste traegt jetzt die Pflegefelder
create or replace function company_tour_options(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return jsonb_build_object(
    'edition_id', v_ed,
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', d.id,
                            'label', coalesce(nullif(btrim(d.label_de), ''), to_char(d.day_date, 'DD.MM.YYYY')))
                          order by d.day_date)
                        from event_day d where d.event_id = v_ed), '[]'::jsonb),
    -- Nur Begleitpersonen vom Typ `tour_lead`: `check_edition_contact` laesst
    -- beim Speichern ohnehin nichts anderes zu, und eine Liste, aus der man
    -- Falsches waehlen kann, ist eine Falle.
    -- ADM-059: mit den Feldern, die der Editor braucht. Dieselbe Runde wie die
    -- Auswahlliste — wer die Begleitung waehlen darf, darf sie auch pflegen.
    'leads', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', c.id, 'name', c.display_name,
                            'email', c.email::text, 'phone', c.phone,
                            'role_label_de', c.role_label_de, 'role_label_en', c.role_label_en,
                            'contract_consent_at', c.contract_consent_at)
                          order by c.sort_order, c.display_name)
                         from edition_contact c where c.edition_id = v_ed and c.type = 'tour_lead'), '[]'::jsonb),
    -- Sessions im Format `company_tour` — **plus** jede, die schon an einer Tour
    -- haengt: sonst verschwaende eine bestehende Verknuepfung aus der Liste,
    -- sobald jemand das Format der Session aendert, und der Editor schriebe sie
    -- beim naechsten Speichern still weg.
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', se.id,
                            'title', coalesce(se.title_de, se.title_en, '(ohne Titel)'),
                            'format', se.format) order by coalesce(se.title_de, se.title_en))
                            from session se
                           where se.event_id = v_ed
                             and (se.format = 'company_tour'
                                  or exists (select 1 from company_tour t where t.session_id = se.id))), '[]'::jsonb),
    'orgs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', coalesce(nullif(btrim(o.communication_name), ''), o.legal_name))
                        order by coalesce(nullif(btrim(o.communication_name), ''), o.legal_name))
                        from organization o where o.active), '[]'::jsonb));
end $$;

select harden_definer_functions();
