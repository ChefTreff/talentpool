-- 00NN · „Eure Bühne“: Speaker auf der gebrandeten Bühne und der Menüpunkt nur mit Bühne (PART-138)
--
-- Anlass: PART-138 (Konrad & Leopold 05.10.): Partner mit dem Produkt „Bühnen-Branding“ branden eine unserer Bühnen und geben Inhalte ein; aus „Standbühne“
-- wird „Eure Bühne“, Speaker einer gebrandeten Bühne sind normale Speaker (PART-091), Standbühnen-Gäste bleiben Gäste (PART-081). Datenmodell: Vorschlag
-- `docs/vorschlag-part138-eure-buehne.md` (#389) — K-84 (Konrad 08.10.): Q1 ja (Menü erst mit zugewiesener Bühne), Q2 ja (der Partner legt Slots selbst an:
-- Migration 0289 `v6_partner_slots` des Speaker-Chats, schon live), Q3 `grants_role` ist Datenpflege (keine Datenzeile hier). Plan hat den Vorschlag freigegeben.
-- **Nur Funktionen — keine neue Tabelle, keine neue Spalte.** Die Oberfläche (Name, Speaker-Reiter statt Gäste, Fenster der gebrandeten Bühne) folgt nach
-- „Migration live“ in einem zweiten PR.
--
-- Was die Migration tut (alle drei Funktionen aus dem Snapshot, `fn-diff`)
--   1  partner_overview: `has_stage` zählt nur Bühnen mit `kind in ('booth', 'branded')` — nicht mehr die Flächen für Side-Event und Interview Table (sonst stand
--      „Standbühne“ im Menü, wo es keine gibt). Der Menüpunkt hängt an `has_stage` (`app/(partner)/partner/nav.ts`): Zuweisung der Bühne im Bühnenformular
--      (ADM-106) und die Rolle `standbuehne_editor` (Produkt `grants_role` oder Organisationsseite) schalten „Eure Bühne“ frei.
--   2  partner_add_speaker: die Organisation, für die der Partner einträgt, ist die der Session; **hat die Session keine** (das Team hat sie auf einer gebrandeten
--      Bühne angelegt, `stage.kind = 'branded'`), die Organisation, die diese Bühne gebrandet hat (`stage.partner_org_id`). Eine Session mit eigener Organisation
--      bleibt bei dieser (eine fremde Organisation auf unserer gebrandeten Bühne trägt dort nichts ein). Alles Weitere unverändert: `created_by_org_id`, Betreuung =
--      Leitung der Bühne, Verwaltet-Fall mit dem Operations-Kontakt **dieser** Organisation, Audit `partner.add_speaker` mit `org_id`.
--   3  partner_speakers: die Session einer gebrandeten Bühne ohne eigene Organisation gehört für diese Liste zur Organisation der Bühne — sonst stünde der eben
--      eingetragene Speaker ohne Session da (die Liste hängt die Session über `partner_org_id` an).
--
-- Was gleich bleibt: `partner_assign_stage_guest` (Gäste nur auf der Standbühne — dort besteht die Sperre schon), `can_edit_stage` und die Regie, die Slot-Rechte
-- (0289), `partner_format_sessions`. Keine Mail, kein Audit-Schlüssel neu.
--
-- Fehlerschlüssel: keine neuen.
set search_path = public, extensions;

create or replace function partner_overview(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o organization%rowtype; v_oe org_edition; v_roles text[]; v_full boolean;
begin
  v_roles := partner_roles(p_org_id);
  if not (cardinality(v_roles) > 0 or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from organization where id = p_org_id;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  v_full := is_partner_team() or v_roles && '{primary_ops,additional,signing}'::text[];
  return jsonb_build_object(
    'org', jsonb_build_object('id', v_o.id, 'legal_name', v_o.legal_name, 'communication_name', v_o.communication_name, 'type', v_o.type,
                              'website', v_o.website, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
                              'logo_dark', v_o.logo_dark, 'logo_light', v_o.logo_light,
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country,
                                                         'extra', v_o.address_extra),
                              'partner_category', v_o.partner_category, 'industry', v_o.industry,
                              -- PART-059: sichtbar für alle Kontakte der Organisation, schreiben darf sie nur das Team.
                              'customer_number', v_o.customer_number),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level,
        -- Erlaubnis zum Weissen fuer die Foto-Wand (PART-053). Kein `v_full`-Gate: es ist
        -- keine sensible Angabe, und wer sie sehen darf, soll sie auch geben koennen.
        'logo_whitening_consent_at', v_oe.logo_whitening_consent_at) end,
    'contacts_count', (select count(*) from org_membership om where om.org_id = p_org_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'name_de', pr.name_de, 'name_en', pr.name_en, 'category', pr.category,
                                                                'type', pr.type, 'qty', op.qty, 'unit_price_cents', case when v_full then op.unit_price_cents end,
                                                                'status', op.status, 'format_key', pr.format_key, 'nachgebucht_am', op.nachgebucht_am) order by pr.type, pr.name_de)
                          from org_product op join product pr on pr.sku = op.product_sku where op.org_edition_id = v_oe.id), '[]'::jsonb),
    'ticket_allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pass_type', a.pass_type, 'quantity', a.quantity, 'status', a.status,
                                                                          'coupon_code', case when a.status = 'active' then a.coupon_code end,
                                                                          'undershop_url', case when a.status = 'active' then a.undershop_url end,
                                                                          'used_count', a.used_count) order by a.pass_type)
                                    from org_ticket_allocation a where a.org_id = p_org_id and a.event_id = v_oe.edition_id and a.status <> 'disabled'), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'due_at', d.due_at, 'label_de', d.label_de, 'label_en', d.label_en,
                                                                 'description_de', d.description_de, 'description_en', d.description_en) order by d.due_at)
                           from deadline d where d.edition_id = v_oe.edition_id and d.audience in ('partner', 'all')), '[]'::jsonb),
    'booth', (select to_jsonb(b) - 'id' - 'notes' from booth_assignment ba join booth b on b.id = ba.booth_id
               where ba.org_edition_id = v_oe.id order by ba.event_day_id nulls first, b.created_at limit 1),
    'checklist', (select jsonb_build_object('total', count(*) filter (where d.status <> 'not_required'),
                                            'done', count(*) filter (where d.status in ('submitted', 'accepted')),
                                            'open', count(*) filter (where d.status in ('open', 'overdue')),
                                            'rejected', count(*) filter (where d.status = 'rejected'),
                                            'overdue', count(*) filter (where d.status = 'overdue'),
                                            'next_due', min(d.due_at) filter (where d.status in ('open', 'rejected', 'overdue')))
                  from deliverable d where d.org_edition_id = v_oe.id),
    'sessions_count', (select count(*) from session se join event ev on ev.id = se.event_id
                       where se.host_org_id = p_org_id and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id) and se.publish_status <> 'cancelled'),
    'has_stage', exists (select 1 from stage st join event ev on ev.id = st.event_id
                         where st.partner_org_id = p_org_id and st.active and st.kind in ('booth', 'branded')
                           and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id))
  );
end $$;

create or replace function partner_add_speaker(p_session_id uuid, p_email text, p_first_name text, p_last_name text, p_verwaltet boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_org uuid; v_oe org_edition; v_person uuid; v_prof uuid; v_email citext; v_n integer; v_owner uuid;
        v_neu boolean := false;
        -- PART-091: Verwaltet-Fall (Operations-Kontakt statt eigenem Zugang).
        v_prof_neu boolean := false; v_ops uuid; v_kontakt uuid; v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  -- PART-138: die Organisation, für die der Partner hier eintragen darf — die der Session; hat die Session keine (das Team hat sie auf einer gebrandeten Bühne
  -- angelegt), die Organisation, die diese Bühne gebrandet hat. Eine Session mit eigener Organisation bleibt bei dieser.
  v_org := v_se.partner_org_id;
  if v_org is null then
    select st.partner_org_id into v_org from slot sl join stage st on st.id = sl.stage_id
     where sl.id = v_se.slot_id and st.kind = 'branded';
  end if;
  if v_org is null or not partner_can_edit(v_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.format not in ('keynote', 'panel', 'talk', 'impulse', 'fireside_chat', 'masterclass') then
    raise exception 'invalid_format' using errcode = '22023', detail = v_se.format;
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '')::citext;
  if v_email is null or v_email::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(p_email, 'null');
  end if;

  -- Ein bestätigter Speaker in dieser Rolle bleibt, wo er ist.
  select count(*)::integer into v_n from session_speaker ss
   where ss.session_id = p_session_id and ss.role = 'speaker' and ss.confirmed;
  if v_n > 0 then raise exception 'slot_locked' using errcode = 'P0001', detail = 'speaker_confirmed'; end if;

  -- Person über die Mailadresse finden oder anlegen (Dublettenregel wie im Partner-Ingest).
  select pe.person_id into v_person from person_email pe where pe.email = v_email limit 1;
  if v_person is null then
    insert into person (first_name, last_name) values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''))
      returning id into v_person;
    insert into person_email (person_id, email, is_primary) values (v_person, v_email, true);
    -- Nur diese Person ist eine, die es ohne den Partner nicht gäbe. Nur sie darf er pflegen.
    v_neu := true;
  end if;

  select oe.* into v_oe from org_edition oe where oe.org_id = v_org
     and oe.edition_id in (select coalesce(ev.edition_id, ev.id) from event ev where ev.id = v_se.event_id)
   limit 1;

  -- Betreuung: die Leitung der Bühne, sonst bleibt es offen und das Team teilt zu.
  select st.stage_lead_person_id into v_owner
    from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;

  select sp.id into v_prof from speaker_profile sp
   where sp.person_id = v_person and sp.edition_id = coalesce(v_oe.edition_id, v_se.event_id);
  -- PART-081: ein Gast der Standbühne ist kein Speaker eines Talks — sonst stünde er ohne Zugang,
  -- Ticket und Lounge auf der Hauptbühne. Erst das Gastprofil entfernen.
  if v_prof is not null and exists (select 1 from speaker_profile where id = v_prof and stage_guest) then
    raise exception 'stage_guest' using errcode = 'P0001';
  end if;
  -- PART-091 (Konrad 25.09.): „Soll der Speaker einen eigenen Zugang erhalten, oder verwaltest du alles
  -- rund um den Slot?“ Verwaltet heisst: reguläres Profil ohne eigene Einladung, der Operations-Kontakt
  -- der Organisation bekommt den Speaker-Zugang, alle Speaker-Mails gehen an ihn.
  if coalesce(p_verwaltet, false) then
    -- Wer schon Speaker der Edition ist, hat seinen eigenen Zugang — dessen Kommunikation leitet kein
    -- Partner um. Nur ein Profil, das derselbe Partner schon verwaltet angelegt hat, darf weitere Slots bekommen.
    if v_prof is not null and not exists (select 1 from speaker_profile sp where sp.id = v_prof
                                            and sp.created_by_org_id = v_org
                                            and sp.mail_via_contact_id is not null) then
      raise exception 'speaker_has_access' using errcode = 'P0001';
    end if;
    select om.person_id into v_ops from org_membership om join person p on p.id = om.person_id
     where om.org_id = v_org and om.roles @> '{primary_ops}' and p.deleted_at is null
     limit 1;
    if v_ops is null then raise exception 'no_ops_contact' using errcode = 'P0001'; end if;
    if v_ops = v_person then raise exception 'contact_is_speaker' using errcode = '23514'; end if;
  end if;
  if v_prof is null then
    -- **`lead`, nicht `invited`** (Probelauf der Architektur-Session, 21.09.: 23514). Das
    -- Vokabular `speaker_pipeline` kennt lead, contacted, confirmed, onboarded, ready,
    -- published, attended, declined — `invited` war meine Erfindung und hätte am CHECK
    -- scheitern müssen, was sie auch tat.
    --
    -- `lead` ist auch inhaltlich der richtige Anfang: wen ein Partner für seine Session
    -- einträgt, hat aus Sicht des Speaker-Teams noch niemand kontaktiert. Die Einladung
    -- verschickt das Team, und zwar erst ab `confirmed` (Regel aus 0025) — stünde hier
    -- „eingeladen", behauptete der Status etwas, das noch nicht passiert ist.
    insert into speaker_profile (person_id, edition_id, pipeline_status, owner_person_id,
                                 created_by_org_id, partner_editable_until_login)
    values (v_person, coalesce(v_oe.edition_id, v_se.event_id), 'lead', v_owner,
            v_org, v_neu)
    returning id into v_prof;
    v_prof_neu := true;
  end if;

  insert into session_speaker (session_id, person_id, role)
  values (p_session_id, v_person, 'speaker')
  on conflict do nothing;

  -- PART-091, Verwaltet-Fall beim ersten Anlegen: der Operations-Kontakt wird Kontakt mit Zugang
  -- (Assistenz-Mechanik aus 0148: `speaker_contact.has_access`, Rolle `speaker_assistant` der Edition)
  -- und Empfänger aller Speaker-Mails (`mail_via_contact_id`). Die Einwilligung bestätigt hier der Partner:
  -- es ist sein eigener Operations-Kontakt, dessen Daten wir ohnehin als Partner-Kontakt führen.
  if coalesce(p_verwaltet, false) and v_prof_neu then
    select sp.edition_id into v_ed from speaker_profile sp where sp.id = v_prof;
    insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
    select v_prof, 'partner', p.id, p.first_name, p.last_name, pe.email, true, current_date
      from person p left join person_email pe on pe.person_id = p.id and pe.is_primary
     where p.id = v_ops
    returning id into v_kontakt;
    update speaker_profile set mail_via_contact_id = v_kontakt where id = v_prof;
    insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
    values (v_ops, 'speaker_assistant', 'edition', v_ed, current_person_id(), 'partner contact of ' || v_prof::text)
    on conflict (person_id, role, scope_type,
                 coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(portal, ''))
    do update set valid_to = null, granted_by = current_person_id();
    perform queue_mail('partner_speaker_contact', v_ops,
      jsonb_build_object('speaker_name', (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
                                            from person p where p.id = v_person),
                         'edition_name', (select e.name from event e where e.id = v_ed)),
      'speaker_profile', v_prof);
  end if;

  -- `claimed` im Audit, damit im Nachhinein erkennbar ist, welcher Partner eine bestehende
  -- Person nur zugeordnet und welche er selbst angelegt hat.
  perform log_audit('partner.add_speaker', 'session', p_session_id::text, null,
                    jsonb_build_object('org_id', v_org, 'person_id', v_person,
                                       'profile_id', v_prof, 'claimed', not v_neu,
                                       'verwaltet', coalesce(p_verwaltet, false), 'contact_id', v_kontakt));
  return v_prof;
end $$;

create or replace function partner_speakers(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, person_id uuid, session_id uuid, session_title text, display_name text, can_edit boolean, confirmed boolean, pipeline_status text, first_name text, last_name text, title text, job_title text, organization_name text, bio_short_de text, bio_short_en text, bio_long_de text, bio_long_en text, linkedin_url text, socials jsonb, photo_asset_id uuid, mail_contact_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, sp.person_id, se.id, se.title_de,
           btrim(concat_ws(' ', pe.first_name, pe.last_name)),
           sp.partner_editable_until_login, coalesce(ss.confirmed, false), sp.pipeline_status,
           -- Ab hier nur, solange das Pflegerecht gilt. Sonst sind es fremde Stammdaten.
           case when sp.partner_editable_until_login then pe.first_name end,
           case when sp.partner_editable_until_login then pe.last_name end,
           case when sp.partner_editable_until_login then pe.title end,
           case when sp.partner_editable_until_login then sp.job_title end,
           case when sp.partner_editable_until_login then sp.organization_name end,
           case when sp.partner_editable_until_login then sp.bio_short_de end,
           case when sp.partner_editable_until_login then sp.bio_short_en end,
           case when sp.partner_editable_until_login then sp.bio_long_de end,
           case when sp.partner_editable_until_login then sp.bio_long_en end,
           case when sp.partner_editable_until_login then pe.linkedin_url end,
           case when sp.partner_editable_until_login then sp.socials end,
           case when sp.partner_editable_until_login then sp.photo_asset_id end,
           -- PART-091: über wen die Kommunikation läuft (Verwaltet-Fall) — der eigene Operations-Kontakt
           -- des Partners, keine fremden Daten. Leer = der Speaker direkt.
           (select nullif(btrim(concat_ws(' ', coalesce(pc.first_name, c.first_name), coalesce(pc.last_name, c.last_name))), '')
              from speaker_contact c left join person pc on pc.id = c.person_id
             where c.id = sp.mail_via_contact_id)
      from speaker_profile sp
      join person pe on pe.id = sp.person_id
      left join session_speaker ss on ss.person_id = sp.person_id
      -- PART-138: auch eine Session ohne Organisation auf einer Bühne, die diese Organisation gebrandet hat (das Team legt sie dort an)
      left join session se on se.id = ss.session_id
                          and (se.partner_org_id = p_org_id
                               or (se.partner_org_id is null
                                   and exists (select 1 from slot sl join stage st on st.id = sl.stage_id
                                                where sl.id = se.slot_id and st.kind = 'branded' and st.partner_org_id = p_org_id)))
     where sp.created_by_org_id = p_org_id
       and sp.edition_id = v_oe.edition_id
       -- PART-081: Gäste der Standbühne stehen in ihrer eigenen Liste (partner_stage_guests).
       and not sp.stage_guest
     order by se.title_de nulls last, pe.last_name, pe.first_name;
end $$;

select harden_definer_functions();
