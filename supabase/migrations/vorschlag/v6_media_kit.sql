-- Media Kit und Partnergrafik (PART-041, ADM-023)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-041 (Konrad 17.09., Antwort 5) — „Marken-Material zum Download und persönliche
-- Partnergrafik (‚Wir sind dabei‘)“; ADM-023 — Admin-Bereich „Grafiken & Media Kit“ für das Marketing
-- (`marketing_team`). Konrad 25.09.: „ja, bitte in einem“ — Media Kit und Partnergrafik im Portal,
-- Pflege im Admin. Entscheidungslog 17.09.: Media Kit im Partner-Portal, Pflege durch das Marketing.
--
-- Kein neues Datenmodell, sondern die beiden vorhandenen Ablagen:
-- * **Media-Kit-Dateien** sind Dateien der Edition (`edition_file`, privater Bucket `edition-files`)
--   mit der neuen Art `media_kit`. Das Marketing (`is_marketing_team()`) darf genau diese Art anlegen,
--   ändern und löschen (`set_edition_file`, `delete_edition_file`) und sieht in `edition_files_admin`
--   nur sie; Hallenplan und die übrigen Arten bleiben bei Produktion und Admin. Partner lesen sie wie
--   den Hallenplan über `edition_files('partner')`.
-- * **Die Partnergrafik** ist eine Datei der Organisation (`partner_asset`, Bucket `partner-assets`,
--   Art `partner_graphic`). Anlegen und ersetzen nur das Team — neu `set_partner_graphic`
--   (Marketing, Partner-Team, Admin; neue Version, gleich angenommen, Audit). Der Partner lädt sie nur
--   herunter: `partner_asset_path_allowed` lässt ihn den Pfad lesen, aber nicht beschreiben, und
--   `register_partner_asset` weist die Art ab. `partner_graphics_admin` listet alle Partner der Edition
--   mit ihrer aktuellen Grafik.
--
-- Dazu: der Bucket `edition-files` nimmt zusätzlich ZIP (Media-Kit-Pakete).
--
-- Alle geänderten Funktionen aus dem Snapshot (Live-Fassung), nur ergänzt.

set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('edition_file_kind', 'media_kit', 'Media Kit', 'Media kit', 5, true)
on conflict (vocabulary, key) do nothing;

-- Ein Media Kit kommt oft als Paket (Logos, Vorlagen, Textbausteine): ZIP zusätzlich erlauben. Welche
-- Typen angenommen werden, entscheidet weiter die Route — die Produktion nimmt nur PDF und Bilder an,
-- das Media Kit auch ZIP.
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct t order by t)
                               from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/zip']) t)
 where id = 'edition-files';

create or replace function set_edition_file(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_kind text; v_ed uuid; v_aud text[];
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_kind := coalesce(nullif(p_data->>'kind', ''), 'sonstiges');
  -- PART-041/ADM-023: das Marketing pflegt die Dateien des Media Kits — nur diese Art, und eine
  -- bestehende Zeile nur, wenn sie schon zum Media Kit gehört (kein Umwidmen des Hallenplans).
  if not (is_staff() or is_production_team()
          or (is_marketing_team() and v_kind = 'media_kit'
              and (v_id is null or exists (select 1 from edition_file f where f.id = v_id and f.kind = 'media_kit')))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not is_vocab_key('edition_file_kind', v_kind) then
    raise exception 'invalid_kind' using errcode = '22023', detail = v_kind;
  end if;
  v_aud := coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)),
    '{}');
  -- Zielgruppen sind Rechte, keine Etiketten: eine erfundene sperrt die Datei
  -- für alle aus oder öffnet sie für niemanden — beides still.
  if exists (select 1 from unnest(v_aud) a where not is_vocab_key('kb_audience', a)) then
    raise exception 'invalid_audience' using errcode = '22023',
      detail = array_to_string(v_aud, ',');
  end if;

  if v_id is null then
    v_ed := nullif(p_data->>'edition_id', '')::uuid;
    if v_ed is null then
      raise exception 'edition_not_found' using errcode = 'P0002', detail = 'edition_id fehlt';
    end if;
    -- Der Pfad muss unter der Edition liegen, zu der der Eintrag gehört.
    -- Sonst könnte ein Team-Konto einen Eintrag auf eine fremde Datei zeigen
    -- lassen — der Bucket prüft das nicht, er kennt nur Bytes.
    if p_data->>'storage_path' is null
       or p_data->>'storage_path' not like v_ed::text || '/%' then
      raise exception 'invalid_path' using errcode = '22023',
        detail = coalesce(p_data->>'storage_path', 'leer');
    end if;
    insert into edition_file (edition_id, kind, storage_path, filename, mime, size_bytes,
                              label_de, label_en, audience, sort_order, uploaded_by)
    values (v_ed, v_kind, p_data->>'storage_path', coalesce(p_data->>'filename', 'datei'),
            nullif(p_data->>'mime', ''), nullif(p_data->>'size_bytes', '')::bigint,
            nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
            case when cardinality(v_aud) > 0 then v_aud
                 else '{partner,speaker,talent,volunteer,hackathon}'::text[] end,
            coalesce((p_data->>'sort_order')::integer, 0), current_person_id())
    returning id into v_id;
  else
    update edition_file set
      kind = v_kind,
      label_de = case when p_data ? 'label_de' then nullif(btrim(p_data->>'label_de'), '') else label_de end,
      label_en = case when p_data ? 'label_en' then nullif(btrim(p_data->>'label_en'), '') else label_en end,
      audience = case when cardinality(v_aud) > 0 then v_aud else audience end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'edition_file_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;
  perform log_audit('edition_file.set', 'edition_file', v_id::text, null, p_data - 'storage_path');
  return v_id;
end $$;
create or replace function delete_edition_file(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_path text;
begin
  if not (is_staff() or is_production_team()
          or (is_marketing_team() and exists (select 1 from edition_file f where f.id = p_id and f.kind = 'media_kit'))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from edition_file where id = p_id returning storage_path into v_path;
  if v_path is null then
    raise exception 'edition_file_not_found' using errcode = 'P0002', detail = p_id::text;
  end if;
  perform log_audit('edition_file.delete', 'edition_file', p_id::text, null, null);
  return v_path;
end $$;
create or replace function edition_files_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, edition_id uuid, edition_slug text, kind text, storage_path text, filename text, mime text, size_bytes bigint, label_de text, label_en text, audience text[], sort_order integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (is_staff() or is_production_team() or is_marketing_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.edition_id, e.slug, f.kind, f.storage_path, f.filename, f.mime, f.size_bytes,
           f.label_de, f.label_en, f.audience, f.sort_order, f.created_at
      from edition_file f join event e on e.id = f.edition_id
     where (p_edition_id is null or f.edition_id = p_edition_id)
       -- PART-041: wer nur das Media Kit pflegt, sieht auch nur dessen Dateien.
       and (is_staff() or is_production_team() or f.kind = 'media_kit')
     order by e.start_date desc nulls last, f.kind, f.sort_order;
end $$;
create or replace function partner_asset_path_allowed(p_name text, p_write boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_org uuid; v_edition uuid; v_kind text;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_org := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  v_kind := split_part(p_name, '/', 3);
  if v_kind !~ '^[a-z][a-z0-9_]{1,40}$' or split_part(p_name, '/', 4) = '' then return false; end if;
  if not exists (select 1 from org_edition oe where oe.org_id = v_org and oe.edition_id = v_edition) then return false; end if;
  if is_staff() then return true; end if;
  -- PART-041: die Partnergrafik („Wir sind dabei“) legt das Marketing oder das Partner-Team an;
  -- der Partner lädt sie nur herunter und kann sie nicht überschreiben.
  if v_kind = 'partner_graphic' then
    return case when p_write then (is_marketing_team() or is_partner_team())
                else (is_partner_of(v_org) or is_marketing_team() or is_partner_team()) end;
  end if;
  return case when p_write then partner_can_edit(v_org) else is_partner_of(v_org) end;
end $$;
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
  -- PART-041: die Partnergrafik legt das Team über set_partner_graphic an, nicht der Partner.
  if p_kind = 'partner_graphic' then raise exception 'not allowed' using errcode = '42501'; end if;
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

create or replace function set_partner_graphic(p_org_id uuid, p_storage_path text, p_filename text,
                                               p_mime text default null, p_size_bytes bigint default null,
                                               p_edition_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_version integer; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (is_staff() or is_marketing_team() or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  -- Derselbe Zuschnitt wie bei den übrigen Dateien der Organisation: <edition>/<org>/<art>/<datei>.
  if p_storage_path is null
     or p_storage_path not like v_oe.edition_id::text || '/' || p_org_id::text || '/partner_graphic/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  -- Eine Grafik zum Teilen: Bild oder PDF.
  if coalesce(p_mime, '') not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf') then
    raise exception 'file_rules' using errcode = '22023', detail = 'mime:' || coalesce(nullif(p_mime, ''), '?');
  end if;

  select coalesce(max(version), 0) + 1 into v_version from partner_asset
   where org_edition_id = v_oe.id and kind = 'partner_graphic' and deliverable_id is null;
  update partner_asset set is_current = false
   where org_edition_id = v_oe.id and kind = 'partner_graphic' and is_current;
  -- Vom Team angelegt, also gleich angenommen — es gibt nichts zu prüfen.
  insert into partner_asset (org_edition_id, kind, storage_path, filename, mime, size_bytes, version,
                             status, reviewed_by, reviewed_at, uploaded_by)
  values (v_oe.id, 'partner_graphic', p_storage_path, coalesce(nullif(btrim(p_filename), ''), 'partnergrafik'),
          p_mime, p_size_bytes, v_version, 'accepted', v_me, now(), v_me)
  returning id into v_id;
  perform log_audit('partner.graphic', 'organization', p_org_id::text, null,
                    jsonb_build_object('asset_id', v_id, 'version', v_version, 'edition_id', v_oe.edition_id));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;

comment on function set_partner_graphic(uuid, text, text, text, bigint, uuid) is
  'PART-041/ADM-023: persönliche Partnergrafik („Wir sind dabei“) einer Organisation anlegen oder ersetzen — Marketing, Partner-Team, Admin. Neue Version, gleich angenommen, im Audit.';

create or replace function partner_graphics_admin(p_edition_id uuid default null)
 returns table (org_id uuid, org_name text, asset_id uuid, storage_path text, filename text, mime text,
                version integer, created_at timestamptz)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
declare v_ed uuid;
begin
  if not (is_staff() or is_marketing_team() or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id,
           nullif(btrim(coalesce(o.communication_name, o.legal_name)), ''),
           a.id, a.storage_path, a.filename, a.mime, a.version, a.created_at
      from org_edition oe
      join organization o on o.id = oe.org_id
      left join partner_asset a on a.org_edition_id = oe.id and a.kind = 'partner_graphic' and a.is_current
     where oe.edition_id = v_ed
     order by lower(coalesce(o.communication_name, o.legal_name));
end $$;

comment on function partner_graphics_admin(uuid) is
  'PART-041/ADM-023: alle Partner einer Edition mit ihrer aktuellen Partnergrafik (oder ohne) — für den Grafikbereich im Admin.';

grant execute on function set_partner_graphic(uuid, text, text, text, bigint, uuid) to authenticated;
grant execute on function partner_graphics_admin(uuid) to authenticated;

select harden_definer_functions();
