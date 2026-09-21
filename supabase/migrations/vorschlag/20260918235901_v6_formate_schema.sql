-- 0132 · Welle 6 A1, Teil 1: Schema für „Eure Formate" (PART-034, PART-044–048).
--
-- Anlass: Arbeitsauftrag Welle 6 §A1, Entwurf `docs/entwurf-a1-formate-2026-09-17.md`,
-- Konrads Entscheidung vom 18.09.2026 für **Weg A** („die saubere Variante"): die Zeiten der
-- Formate bleiben am `slot`, sie bekommen keine eigenen Zeitspalten an `session`.
--
-- Teil 1 ist reines Schema — Vokabular, Spalten, zwei Rechtekorrekturen. Die RPCs
-- (`partner_create_session`, `partner_update_session`, `partner_add_speaker`, Fragen, Export)
-- folgen als Teil 2, nach der Prüfung dieser Datei.
--
-- **Zwei Rechtekorrekturen, die kein Wunsch sind, sondern eine Folge** (siehe Abschnitt 4):
-- `partner_overview.has_stage` und `can_edit_stage` unterscheiden bisher keine Bühnentypen,
-- weil es nur einen Partner-Typ gab. Mit dem zweiten (`interview_table`) werden beide falsch.
-- `can_edit_stage` ist eine Rechtefunktion ⇒ Vorprüfung nach `db-konventionen.md` §C.
--
-- Was der Auftrag vorsah und hier **nicht** steht, mit Begründung:
-- * `session.starts_at/ends_at` — gibt es nicht und soll es nicht geben (Weg A).
-- * Vokabular `side_event`, `masterclass`, `company_tour` — stehen seit dem Seed vom 08.09.
--   in `session_format`; nur `interview_table` fehlte.
-- * Tabelle `question_request` — `session_question` kann eigene Fragen samt `approved_by`
--   bereits; ein Antrag ist eine Zeile ohne Freigabe. Statt einer Tabelle drei Spalten.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('session_format', 'interview_table', 'Interview Table', 'Interview table', 19, true),
  -- Bühnentypen: `stage.type` trägt einen CHECK, deshalb zusätzlich unten erweitert.
  ('stage_type', 'interview_table',  'Interview Table', 'Interview table', 60, true),
  ('stage_type', 'side_event_venue', 'Side-Event-Ort',  'Side event venue', 70, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- Der CHECK an `stage.type` ist die harte Grenze; das Vokabular liefert nur die Beschriftung.
alter table stage drop constraint if exists stage_type_check;
alter table stage add constraint stage_type_check
  check (type in ('main', 'side', 'partner_booth', 'room', 'interview_table', 'side_event_venue'));

comment on column stage.type is
  'main/side/room = Bühnen und Räume des Programms · partner_booth = Standbühne eines Partners (gibt Bearbeitungsrechte) · interview_table = Tisch eines Partners für Interview Tables · side_event_venue = Träger für Side-Event-Slots, der wirkliche Ort steht in session.format_details.location_text.';

-- **Auflage 2 der Architektur-Session (21.09.).** `upsert_stage` trug die vier alten Typen als
-- Literalliste im Code. Das Team hätte im Admin keine `interview_table`- und keine
-- `side_event_venue`-Bühne anlegen können (22023 `invalid_stage_type`), und ohne die legt
-- `partner_create_session` nichts an — der ganze Baustein wäre über eine vergessene Zeile
-- gestolpert.
--
-- Die Liste weicht dem Vokabular. Damit trägt `stage_type` künftige Typen ohne Migration, und
-- es gibt nur noch **eine** Stelle, die weiß, welche Typen es gibt (der CHECK oben bleibt die
-- harte Grenze, das Vokabular die weiche — beide werden in derselben Migration erweitert).
-- Grundlage ist die Live-Fassung aus `supabase/snapshot/functions/upsert_stage.sql`
-- (20260917184553); geändert ist nur die Typprüfung.
create or replace function upsert_stage(p_data jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_type text; v_before jsonb;
begin
  if v_id is not null then
    select st.event_id into v_event from stage st where st.id = v_id;
    if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_type := nullif(p_data->>'type', '');
  -- Vorher: v_type not in ('main', 'side', 'partner_booth', 'room')
  if v_type is not null and not is_vocab_key('stage_type', v_type) then
    raise exception 'invalid_stage_type' using errcode = '22023', detail = v_type;
  end if;

  select to_jsonb(st) into v_before from stage st where st.id = v_id;

  if v_id is null then
    insert into stage (event_id, name, slug, type, room, capacity, partner_org_id, stage_lead_person_id,
                       changeover_min, default_duration_min, partner_slot_quota, sort_order, active)
    values (v_event, btrim(p_data->>'name'), nullif(btrim(p_data->>'slug'), ''), coalesce(v_type, 'side'),
            nullif(btrim(p_data->>'room'), ''), (p_data->>'capacity')::integer,
            nullif(p_data->>'partner_org_id', '')::uuid, nullif(p_data->>'stage_lead_person_id', '')::uuid,
            coalesce((p_data->>'changeover_min')::integer, 0),
            coalesce((p_data->>'default_duration_min')::integer, 30),
            (p_data->>'partner_slot_quota')::integer,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    update stage set
      name                 = coalesce(nullif(btrim(p_data->>'name'), ''), name),
      slug                 = case when p_data ? 'slug' then nullif(btrim(p_data->>'slug'), '') else slug end,
      type                 = coalesce(v_type, type),
      room                 = case when p_data ? 'room' then nullif(btrim(p_data->>'room'), '') else room end,
      capacity             = case when p_data ? 'capacity' then (p_data->>'capacity')::integer else capacity end,
      partner_org_id       = case when p_data ? 'partner_org_id' then nullif(p_data->>'partner_org_id', '')::uuid else partner_org_id end,
      stage_lead_person_id = case when p_data ? 'stage_lead_person_id' then nullif(p_data->>'stage_lead_person_id', '')::uuid else stage_lead_person_id end,
      changeover_min       = coalesce((p_data->>'changeover_min')::integer, changeover_min),
      default_duration_min = coalesce((p_data->>'default_duration_min')::integer, default_duration_min),
      partner_slot_quota   = case when p_data ? 'partner_slot_quota' then (p_data->>'partner_slot_quota')::integer else partner_slot_quota end,
      sort_order           = coalesce((p_data->>'sort_order')::integer, sort_order),
      active               = coalesce((p_data->>'active')::boolean, active)
    where id = v_id;
  end if;

  perform log_audit('programme.stage_upsert', 'stage', v_id::text, v_before, p_data);
  return v_id;
end $$;

-- ---------------------------------------------------------------- 2) Spalten an `session`

alter table session add column if not exists partner_org_id uuid references organization (id) on delete set null;
alter table session add column if not exists format_details jsonb not null default '{}'::jsonb;
create index if not exists session_partner_org_idx on session (partner_org_id) where partner_org_id is not null;

comment on column session.partner_org_id is
  'Der Partner, der dieses Format gebucht hat. Unterschied zu host_org_id: host = richtet aus (Masterclass, Company Tour, Side-Event, Interview Table — zählt in sessions_count und öffnet /partner/bewerber); partner_org_id = hat gebucht, auch beim Talk, wo die Bühne uns gehört und der Partner nur den Speaker stellt.';
comment on column session.format_details is
  'Formatspezifische Angaben mit festen Schlüsseln, geprüft in den Partner-RPCs (Teil 2). Nie freie Schlüssel; contact_* der Company Tour gehen nicht nach programme_public.';

-- Wo beide gesetzt sind, müssen sie dieselbe Organisation nennen — sonst stünde an einer
-- Session, wer sie ausrichtet, und daneben ein anderer, der sie gebucht hat.
alter table session drop constraint if exists session_org_consistent_chk;
alter table session add constraint session_org_consistent_chk
  check (host_org_id is null or partner_org_id is null or host_org_id = partner_org_id);

-- Bestand: wo eine Session schon einen Gastgeber hat, ist das auch der buchende Partner.
update session set partner_org_id = host_org_id
 where host_org_id is not null and partner_org_id is null;

-- ---------------------------------------------------------------- 3) Fragen auf Antrag

alter table question_catalog add column if not exists partner_selectable boolean not null default false;
comment on column question_catalog.partner_selectable is
  'Darf ein Partner diese Katalogfrage für sein Format auswählen? Vorgabe nein — der Katalog trägt auch Fragen, die nur das Team stellt.';

alter table session_question add column if not exists requested_by uuid references person (id) on delete set null;
alter table session_question add column if not exists purpose text;
comment on column session_question.requested_by is
  'Wer diese eigene Frage beantragt hat. Zusammen mit approved_at der Antragsweg: Zeile ohne approved_at = beantragt, mit = freigegeben und im Bewerbungsformular sichtbar.';
comment on column session_question.purpose is
  'Wozu die Frage dient — Pflicht bei beantragten Fragen (Teil 2 prüft es). Konrads Beispiel: Geschlecht nur für ein Frauen-Format, mit ausgewiesenem Zweck. Die Regel „keine Art.-9-Fragen" prüft das Team bei der Freigabe; eine Freitextfrage lässt sich nicht automatisch als sensibel erkennen.';

-- ---------------------------------------------------------------- 4) Zwei Rechtekorrekturen
--
-- Beide Funktionen setzen bisher „Bühne mit partner_org_id" mit „Standbühne" gleich. Das war
-- richtig, solange `partner_booth` der einzige Partner-Typ war. Ab jetzt gibt es Tische und
-- Side-Event-Orte, die ebenfalls einer Organisation gehören — ohne die Typ-Bedingung bekäme
-- ein Partner dadurch Dinge, die er nicht gebucht hat.

-- (a) Menü: „Standbühne" nur bei einer echten Standbühne.
--     Grundlage ist die Live-Fassung aus `supabase/snapshot/functions/partner_overview.sql`,
--     Stand nach **0124** („Stände tagesweise", 21.09.); neu ist allein
--     `st.type = 'partner_booth'` in `has_stage`.
--
--     Die erste Fassung dieses Vorschlags ging von einem älteren Stand aus und hätte zwei
--     Dinge still zurückgedreht: `logo_dark`/`logo_light` an der Organisation und den Stand,
--     der seit 0124 über `booth_assignment` je Tag gelesen wird. Genau dafür gibt es den
--     Snapshot (`docs/db-konventionen.md` §1).
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
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country),
                              'partner_category', v_o.partner_category),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level) end,
    'contacts_count', (select count(*) from org_membership om where om.org_id = p_org_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'name_de', pr.name_de, 'name_en', pr.name_en, 'category', pr.category,
                                                                'type', pr.type, 'qty', op.qty, 'unit_price_cents', case when v_full then op.unit_price_cents end,
                                                                'status', op.status, 'format_key', pr.format_key) order by pr.type, pr.name_de)
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
    -- Nur eine echte Standbühne blendet den Menüpunkt ein. Tische und Side-Event-Orte
    -- gehören dem Partner ebenfalls, sind aber keine Bühne, die er bespielt.
    'has_stage', exists (select 1 from stage st join event ev on ev.id = st.event_id
                         where st.partner_org_id = p_org_id and st.active and st.type = 'partner_booth' and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id))
  );
end $$;

-- (b) Rechte: `standbuehne_editor` gilt für die Standbühne, nicht für jede Fläche der Org.
--     Grundlage ist die Live-Fassung aus `20260910170349_v3_hubspot_ingest.sql`; neu ist
--     allein `st.type = 'partner_booth'` in der letzten Bedingung. Ohne sie bekäme ein
--     Partner mit Standbühne über `can_edit_regie` (Entscheidung 15.09.) auch die Regie
--     seiner Interview-Tische — Rechte, die niemand vergeben hat.
create or replace function can_edit_stage(p_stage_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from stage st
    join event ev on ev.id = st.event_id
    join active_roles() ra on true
    where st.id = p_stage_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage' and ra.scope_id = st.id)
        or (ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and st.type = 'partner_booth'
            and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
      )
  )
$$;

-- ---------------------------------------------------------------- 5) Talk: Speaker vom Partner

alter table speaker_profile add column if not exists created_by_org_id uuid references organization (id) on delete set null;
alter table speaker_profile add column if not exists partner_editable_until_login boolean not null default false;
create index if not exists speaker_profile_created_by_org_idx on speaker_profile (created_by_org_id) where created_by_org_id is not null;

comment on column speaker_profile.created_by_org_id is
  'Der Partner, der diesen Speaker über /partner/talk eingetragen hat. Ohne dieses Feld wäre bei einem Speaker mit zwei Sessions nicht entscheidbar, welcher Partner ihn pflegen darf.';
comment on column speaker_profile.partner_editable_until_login is
  'Solange wahr, darf der eintragende Partner die Stammdaten pflegen — gedacht für den Fall, dass der Speaker (z. B. ein CEO) es nicht selbst tut. Fällt beim ersten Login des Speakers; danach nur noch lesen.';

-- Das Flag fällt an dem Ereignis, das es beschreibt: sobald die Person ihr Auth-Konto mit dem
-- Portal verbindet. Ein Cron dafür wäre eine zweite Wahrheit über „hat sich angemeldet".
create or replace function drop_partner_edit_on_login() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.auth_user_id is not null and old.auth_user_id is null then
    update speaker_profile set partner_editable_until_login = false
     where person_id = new.id and partner_editable_until_login;
  end if;
  return new;
end $$;
revoke execute on function drop_partner_edit_on_login() from public, anon, authenticated;

drop trigger if exists trg_person_login_drops_partner_edit on person;
create trigger trg_person_login_drops_partner_edit
  after update of auth_user_id on person
  for each row execute function drop_partner_edit_on_login();

-- 7) Interview Tables bekommen ihren Artikel (Konrad 21.09.: **I-66084**, intern angelegt,
--    noch weder in HubSpot noch in SevDesk). Bis hierher war `format_key = 'interview_table'`
--    das einzige Vokabular ohne Produkt (0110, PROD-006) — die Seite öffnete also bei
--    niemandem, weil `visibleNavKeys` an gebuchten Produkten hängt.
--
--    Drei Entscheidungen, die wir hier treffen und nicht dem Zufall überlassen:
--
--    * **`category = 'stage_products'`.** Nicht `specials`, wo das Side Event liegt: Interview
--      Tables sind in diesem Modell eine Bühne (`stage.type = 'interview_table'`) mit echten
--      `slot`-Zeilen, genau wie Talk und Masterclass. Sie gehören zu denselben Nachbarn.
--      `stage_products` trägt außerdem **keine** Pflicht auf Kategorieebene — der Artikel erbt
--      also nichts, was für Standflächen, Branding oder Hackathon gedacht ist.
--    * **`source_hubspot = true`.** Damit nimmt `products_for_sync('hubspot')` den Artikel beim
--      nächsten Abgleich (A4.3) mit hinaus; dasselbe gilt für SevDesk. Das ist der Weg, den
--      Konrad erwartet — die Nummer entsteht im Portal und wandert nach außen, nicht umgekehrt.
--    * **`net_price_cents` bleibt NULL.** Die Katalogpreise kommen im Oktober mit der neuen
--      Liste (Konrad 21.09.). Ein erfundener oder auf null gesetzter Preis wäre schlimmer als
--      keiner: der Preis-Snapshot beim HubSpot-Ingest würde ihn übernehmen und in der
--      Partner-Übersicht als „0,00 €" erscheinen. NULL heißt sichtbar „steht noch aus".
--
--    `active = true` ist nötig, damit der Ingest einen Deal mit dieser SKU annimmt — er weist
--    inaktive Artikel mit `inactive_sku` ab. Pflege danach über `upsert_product` und den
--    Produkte-Reiter im Partner-Admin, nicht über eine weitere Migration.
--
--    **Der Steuersatz ist nicht geraten.** Er kommt aus der Masterclass (I-33783), dem nächsten
--    Verwandten in derselben Kategorie, und nur ersatzweise aus dem Tabellen-Default. Eine Zahl,
--    die ich mir ausdenke, wäre hier eine steuerliche Aussage; die trifft die Buchhaltung.
insert into product (sku, name_de, name_en, description_de, description_en,
                     type, category, unit, vat_rate, source_hubspot, active, format_key)
values ('I-66084', 'Interview Tables', 'Interview tables',
        'Tisch und Stühle für volle Messetage. Ihr legt eure Gesprächsslots selbst an, hinterlegt eure Stellenausschreibung und wählt die Profile, die ihr sucht; Bewerbungen verwaltet ihr im Portal.',
        'A table and chairs for full expo days. You set up your own interview slots, add your job posting and choose the profiles you are looking for; applications are managed in the portal.',
        'package', 'stage_products', 'piece',
        coalesce((select p.vat_rate from product p where p.sku = 'I-33783'), 7),
        true, true, 'interview_table')
on conflict (sku) do update set
  format_key = excluded.format_key,
  -- Namen und Texte nur füllen, wenn noch nichts da ist: sollte Konrad den Artikel vor dieser
  -- Migration selbst angelegt haben, gewinnt seine Fassung. Das Portal ist Quelle der Wahrheit.
  name_de = coalesce(nullif(product.name_de, ''), excluded.name_de),
  name_en = coalesce(nullif(product.name_en, ''), excluded.name_en),
  description_de = coalesce(nullif(product.description_de, ''), excluded.description_de),
  description_en = coalesce(nullif(product.description_en, ''), excluded.description_en),
  active = true;

select harden_definer_functions();
