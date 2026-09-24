-- Vorschlag · Welle 6: Logo-Wand — Einwilligung zum Weißen, und nur noch SVG oder EPS (PART-053).
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
-- Neu aufgesetzt nach dem Einzug von `main` am 24.09.; `register_partner_asset` und
-- `partner_overview` sind gegen die Live-Datenbank geprüft (`db.sh fn-diff`), nicht gegen die
-- Kopie vom 22.09.
--
-- Anlass: Konrad, 22.09.2026, zwei Antworten und eine neue Anforderung.
--
-- **1) Nur noch SVG und EPS.** Die Pflicht `logo_vector` nahm bisher auch `ai` und `pdf`. Wer
-- eine Illustrator-Datei hochlud, hatte die Pflicht erfüllt — und die Druckerei bekam trotzdem
-- nicht, was sie braucht. Die Regel steht an **zwei** Stellen: in `deliverable_template
-- .file_rules` und noch einmal hartcodiert in `register_partner_asset`. Beide werden hier
-- geändert; ändert man nur eine, erlaubt die eine, was die andere abweist, und die Meldung
-- sieht aus wie ein Fehler im Portal.
--
-- Kein Bestand betroffen: `partner_asset` ist heute leer (geprüft am 22.09.).
--
-- **2) Einwilligung zum Weißen.** Für die Foto-Wand auf dem Summit drucken wir die Logos
-- einfarbig weiß. Das verändert die Marke des Partners, und dafür braucht es seine Zustimmung.
-- Ohne sie wird das Logo **nicht** auf die Wand gedruckt — hochladen darf er es trotzdem, denn
-- das Logo dient auch Website, Event-App und Programm.
--
-- **Warum an `org_edition` und nicht an der Datei.** Die Erlaubnis gilt der Marke, nicht einer
-- Fassung: Wer sein SVG korrigiert und neu hochlädt, soll nicht stillschweigend von der Wand
-- fallen. Genau dieses stille Verschwinden ist das Problem, das die ganze Liste lösen soll.
--
-- **Warum nicht `consent_record`.** Die Tabelle ist für personenbezogene Einwilligungen gebaut
-- (`person_id`, `ip_hash`, `user_agent`, Widerruf als eigene Zeile). Hier stimmt ein
-- **Unternehmen** der Bearbeitung seines Markenzeichens zu — kein Datenschutz-Sachverhalt.
-- Eine Marken-Nutzungserlaubnis in die DSGVO-Nachweistabelle zu legen, würde beide unschärfer
-- machen. Wer sie erteilt hat und wann, steht trotzdem in der Spalte und im Audit.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Nur SVG und EPS

update deliverable_template
   set file_rules = jsonb_build_object(
         'ext', jsonb_build_array('svg', 'eps'),
         'mime', jsonb_build_array('image/svg+xml', 'application/postscript',
                                   'application/eps', 'application/x-eps', 'image/eps'),
         'max_bytes', 20971520),
       description_de = 'SVG oder EPS für Website, Event-App und Druck. Das Logo wird nach Prüfung automatisch veröffentlicht.',
       description_en = 'SVG or EPS for website, event app and print. Published automatically after review.'
 where key = 'logo_vector' and product_sku is null and category is null;

-- Zweite Stelle: die Liste im Code. Wortgleich aus
-- `supabase/snapshot/functions/register_partner_asset.sql` übernommen; geändert ist allein
-- die Endungsliste im `elsif`-Zweig.
--
-- **Mein erster Versuch hatte diese Funktion aus dem Gedächtnis nachgebaut.** `db.sh fn-diff`
-- hat sechs Abweichungen gezeigt: die Signatur hatte sieben statt acht Parameter (es wäre eine
-- zweite Überladung entstanden statt einer Ersetzung), die Versionszählung war nicht mehr je
-- Pflicht getrennt, und der Audit-Eintrag hieß anders und hing an einem anderen Objekt.
-- Deshalb steht hier eine Kopie, kein Nachbau.
create or replace function register_partner_asset(p_org_id uuid, p_kind text, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_deliverable_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_d deliverable; v_t deliverable_template; v_rules jsonb; v_ext text; v_version integer; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'invalid_kind' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_storage_path not like v_oe.edition_id::text || '/' || p_org_id::text || '/' || p_kind || '/%' then raise exception 'path_mismatch' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then raise exception 'object_not_found' using errcode = 'P0002'; end if;
  v_ext := lower(nullif(regexp_replace(coalesce(p_filename, ''), '^.*\.', ''), coalesce(p_filename, '')));
  if p_deliverable_id is not null then
    select * into v_d from deliverable where id = p_deliverable_id and org_edition_id = v_oe.id;
    if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
    select * into v_t from deliverable_template where id = v_d.template_id;
    v_rules := coalesce(v_t.file_rules, '{}'::jsonb);
    if v_rules ? 'ext' and not (v_rules->'ext' @> to_jsonb(coalesce(v_ext, ''))) then
      raise exception 'file_rules' using errcode = '22023', detail = 'ext:' || coalesce(v_ext, '?') || ' allowed:' || (v_rules->>'ext');
    end if;
    if v_rules ? 'mime' and p_mime is not null and p_mime not in ('application/octet-stream', '') and not (v_rules->'mime' @> to_jsonb(p_mime)) then
      raise exception 'file_rules' using errcode = '22023', detail = 'mime:' || p_mime;
    end if;
    if v_rules ? 'max_bytes' and p_size_bytes is not null and p_size_bytes > (v_rules->>'max_bytes')::bigint then
      raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
    end if;
  -- Vorher: ('svg', 'eps', 'ai', 'pdf'). Konrad, 22.09.: nur noch Vektordateien, die die
  -- Druckerei ohne Rueckfrage oeffnet. Dieser Zweig greift nur ohne `p_deliverable_id` —
  -- mit Pflicht gelten die `file_rules` der Vorlage, die oben angepasst sind.
  elsif p_kind = 'logo_vector' and coalesce(v_ext, '') not in ('svg', 'eps') then
    raise exception 'file_rules' using errcode = '22023', detail = 'logo_vector: svg, eps';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from partner_asset
   where org_edition_id = v_oe.id and kind = p_kind and coalesce(deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid);
  update partner_asset set is_current = false
   where org_edition_id = v_oe.id and kind = p_kind and is_current
     and coalesce(deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid);
  insert into partner_asset (org_edition_id, deliverable_id, kind, storage_path, filename, mime, size_bytes, version, uploaded_by)
  values (v_oe.id, p_deliverable_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_me)
  returning id into v_id;
  if p_kind = 'logo_vector' then perform partner_onboarding_recheck(v_oe.id); end if;
  perform log_audit('partner.asset', 'organization', p_org_id::text, null, jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'deliverable_id', p_deliverable_id));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;

-- ---------------------------------------------------------------- 2) Einwilligung

alter table org_edition add column if not exists logo_whitening_consent_at timestamptz;
alter table org_edition add column if not exists logo_whitening_consent_by uuid references person (id) on delete set null;

comment on column org_edition.logo_whitening_consent_at is
  'Der Partner erlaubt, sein Logo für die Foto-Wand auf dem Summit einfarbig weiß zu drucken (Konrad, 22.09.2026). NULL heißt: keine Erlaubnis, das Logo kommt nicht auf die Wand — hochladen und anderweitig nutzen bleibt davon unberührt. Gilt je Edition und **nicht je Datei**: wer sein Logo korrigiert, soll nicht stillschweigend von der Wand fallen.';
comment on column org_edition.logo_whitening_consent_by is
  'Wer die Erlaubnis erteilt hat. Nachweis, kein Anzeigefeld.';

-- Setzen und zurücknehmen in einer Funktion: eine erteilte Erlaubnis muss widerrufbar sein,
-- sonst wäre sie keine.
create or replace function set_logo_whitening_consent(
  p_org_id uuid, p_granted boolean, p_edition_id uuid default null)
returns timestamptz
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_at timestamptz;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;

  -- Eine bestehende Erlaubnis wird nicht neu datiert, wenn sie noch einmal bestätigt wird:
  -- der Nachweis soll sagen, wann sie erteilt wurde, nicht wann jemand zuletzt geklickt hat.
  update org_edition set
    logo_whitening_consent_at = case when p_granted then coalesce(logo_whitening_consent_at, now()) end,
    logo_whitening_consent_by = case when p_granted then coalesce(logo_whitening_consent_by, current_person_id()) end
  where id = v_oe.id
  returning logo_whitening_consent_at into v_at;

  perform log_audit(case when p_granted then 'partner.logo_whitening_granted' else 'partner.logo_whitening_revoked' end,
                    'org_edition', v_oe.id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'granted', p_granted));
  return v_at;
end $$;
revoke execute on function set_logo_whitening_consent(uuid, boolean, uuid) from public, anon;
grant execute on function set_logo_whitening_consent(uuid, boolean, uuid) to authenticated;

comment on function set_logo_whitening_consent(uuid, boolean, uuid) is
  'Der Partner erlaubt oder verweigert das Weißen seines Logos für die Foto-Wand (PART-053). Widerruf ist vorgesehen: `p_granted = false` setzt beide Felder zurück.';

-- ---------------------------------------------------------------- 3) Sichtbar machen

-- Beide Oberflaechen lesen den Stand aus `partner_overview` — das Partner-Portal am
-- Logo-Upload, der Admin an der Organisation. Wortgleich aus dem Snapshot uebernommen
-- (Stand nach 0132); ergaenzt ist allein der eine Schluessel im Editionsblock.
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
                              'partner_category', v_o.partner_category, 'industry', v_o.industry),
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
    'has_stage', exists (select 1 from stage st join event ev on ev.id = st.event_id
                         where st.partner_org_id = p_org_id and st.active and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id))
  );
end $$;

select harden_definer_functions();
