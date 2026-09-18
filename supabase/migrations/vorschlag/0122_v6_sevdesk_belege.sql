-- =============================================================================
-- 0122 · Welle 6 · Belege aus SevDesk im Partnerportal (A5, PART-036)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Partner fragen ihre Angebote und Rechnungen heute per Mail nach. Beides liegt
-- in SevDesk, und beides gehört in das Portal, in dem sie sowieso arbeiten.
--
-- **Nur Lesen bei SevDesk.** Der Abruf holt PDF und Kopfdaten, sonst nichts:
-- kein Anlegen, kein Ändern, kein Löschen. Ein Portal, das in der Buchhaltung
-- schreiben darf, ist ein Portal, das eine Rechnung verändern kann.
--
-- **Belege werden nie gelöscht, nur ersetzt.** Der Pfad ist
-- `<edition>/<org>/documents/<sevdesk-id>.pdf` und `partner_asset.storage_path`
-- ist eindeutig — derselbe Beleg zweimal abgerufen ergibt dieselbe Zeile mit
-- neuem Stand. Eine korrigierte Rechnung hat in SevDesk eine eigene Nummer und
-- kommt deshalb als eigene Zeile, nicht als Überschreibung der alten.
--
-- **Zwei Wege, zwei Kontexte:**
-- * `register_sevdesk_document` gehört dem Server. Sie prüft
--   `auth.uid() is null` und nicht die Rolle — unter der Service Role ist
--   `has_role(…)` immer false, eine Rollenprüfung wäre dort nicht streng,
--   sondern kaputt (Befund zu 0120). Die Rolle prüft die Route davor.
-- * `upload_partner_document` ist der Rückfall für das Team, wenn SevDesk
--   schweigt oder ein Beleg von Hand kommt. Sie prüft `is_partner_team()` und
--   läuft im Nutzerkontext.
--
-- `register_partner_asset` (0053) taugt für Belege **nicht**: sie setzt die
-- vorige Fassung derselben `kind` auf `is_current = false`. Bei Rechnungen wäre
-- damit immer nur die letzte gültig, und die drei davor verschwänden aus der
-- Liste. Deshalb eine eigene Funktion, die nichts überholt.
--
-- Die Zielliste liest **beides**: das Team im Portal und der nächtliche Lauf als
-- `service_role`. Das Schreiben ist getrennt — Server oder Team, nie beides in
-- einer Funktion.
--
-- Fehlerschlüssel: 42501 (Rolle bzw. falscher Kontext) · 22023 `invalid_kind` ·
-- 22023 `path_mismatch` · P0002 `org_edition_not_found` · P0002 `object_not_found`.
--
-- Test: supabase/tests/v6_sevdesk_belege.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Lesen

/**
 * Wen der Abruf anfassen soll, und was schon da ist.
 *
 * Eine Zeile je Organisation mit SevDesk-Kennung: ohne die Kennung gibt es
 * drüben nichts zu holen. `bekannt` nennt die schon abgelegten SevDesk-Ids —
 * damit lädt der Lauf nur, was fehlt, statt jeden Beleg jeden Tag neu
 * herunterzuziehen.
 */
create or replace function sevdesk_document_targets(p_edition_id uuid default null)
returns table (org_id uuid, org_edition_id uuid, edition_id uuid, org_name text,
               sevdesk_contact_id text, bekannt text[])
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  -- **Zwei erlaubte Kontexte, und beide ausdrücklich.** Das Team liest die Liste
  -- im Portal; der nächtliche Lauf liest sie als `service_role`, wo `auth.uid()`
  -- null und `has_role(…)` deshalb immer false ist. Eine reine Rollenprüfung
  -- hätte den Cron beim ersten Aufruf mit 42501 abgewiesen — derselbe Fehler,
  -- den die Architektur-Session in 0120 gefunden hat. `coalesce` nach §4: eine
  -- nackte ODER-Kette wird NULL, sobald ein Glied NULL ist.
  if not coalesce(is_partner_team() or auth.uid() is null, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id, oe.id, oe.edition_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           o.sevdesk_contact_id,
           coalesce((select array_agg(a.filename order by a.filename)
                       from partner_asset a
                      where a.org_edition_id = oe.id and a.kind in ('offer', 'invoice')), '{}')
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed and nullif(btrim(o.sevdesk_contact_id), '') is not null
     order by 4;
end $$;
grant execute on function sevdesk_document_targets(uuid) to authenticated;

-- ---------------------------------------------------------------- Schreiben

/**
 * Einen abgerufenen Beleg eintragen.
 *
 * **Gehört dem Serverkontext** (siehe Kopf). Idempotent über den Pfad: derselbe
 * Beleg zweimal abgerufen ergibt dieselbe Zeile. Nichts wird überholt — jede
 * Rechnung bleibt gültig, auch wenn zehn weitere folgen.
 */
create or replace function register_sevdesk_document(
  p_org_edition_id uuid, p_kind text, p_storage_path text, p_filename text,
  p_size_bytes bigint default null)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_id uuid;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('offer', 'invoice') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(p_kind, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;
  -- Der Pfad muss zur Organisation gehören, deren Beleg er trägt. Sonst
  -- schriebe ein vertauschtes Argument die Rechnung eines Partners in den
  -- Ordner eines anderen — und die Leseregel des Buckets liesse sie dort lesen.
  if p_storage_path not like v_oe.edition_id::text || '/' || v_oe.org_id::text || '/documents/%' then
    raise exception 'path_mismatch' using errcode = '22023', detail = p_storage_path;
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002', detail = p_storage_path;
  end if;

  insert into partner_asset (org_edition_id, kind, storage_path, filename, mime,
                             size_bytes, version, is_current, status)
  values (p_org_edition_id, p_kind, p_storage_path, p_filename, 'application/pdf',
          p_size_bytes, 1, true, 'accepted')
  on conflict (storage_path) do update
     set filename = excluded.filename, size_bytes = excluded.size_bytes, updated_at = now()
  returning id into v_id;

  -- Kein `log_audit` je Beleg: der Lauf schreibt seine Zahlen als ein Eintrag
  -- in `integration.sync_job`, und hundert Protokollzeilen je Nacht sagen
  -- weniger als eine mit vier Zahlen.
  return v_id;
end $$;
revoke execute on function register_sevdesk_document(uuid, text, text, text, bigint)
  from public, anon, authenticated;

/**
 * Der Rückfall: ein Beleg von Hand.
 *
 * Wenn SevDesk schweigt oder etwas ausserhalb entstanden ist, legt das Team den
 * Beleg selbst ab. Gleiche Regeln, gleicher Pfad — nur im Nutzerkontext und mit
 * Rollenprüfung, und **mit** Protokolleintrag: eine Datei, die ein Mensch
 * hochgeladen hat, soll später jemandem zuzuordnen sein.
 */
create or replace function upload_partner_document(
  p_org_edition_id uuid, p_kind text, p_storage_path text, p_filename text,
  p_size_bytes bigint default null)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_id uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('offer', 'invoice') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(p_kind, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;
  if p_storage_path not like v_oe.edition_id::text || '/' || v_oe.org_id::text || '/documents/%' then
    raise exception 'path_mismatch' using errcode = '22023', detail = p_storage_path;
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002', detail = p_storage_path;
  end if;

  insert into partner_asset (org_edition_id, kind, storage_path, filename, mime,
                             size_bytes, version, is_current, status, uploaded_by)
  values (p_org_edition_id, p_kind, p_storage_path, p_filename, 'application/pdf',
          p_size_bytes, 1, true, 'accepted', current_person_id())
  on conflict (storage_path) do update
     set filename = excluded.filename, size_bytes = excluded.size_bytes,
         uploaded_by = current_person_id(), updated_at = now()
  returning id into v_id;

  perform log_audit('partner.document', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'filename', p_filename));
  return v_id;
end $$;
grant execute on function upload_partner_document(uuid, text, text, text, bigint) to authenticated;

select harden_definer_functions();
