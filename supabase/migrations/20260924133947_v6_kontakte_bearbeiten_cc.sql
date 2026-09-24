-- 0159 · Welle 6 · Kontakte bearbeiten und CC-Kontakt (PART-062/063): update_partner_contact, partner_mail_cc, mail_cc_recipients, Kopie an fünf Partner-Mails
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924133947.
-- Vorschlag · Welle 6 · Kontakte bearbeiten und CC-Kontakt (PART-062/063): org_membership.partner_editable_until_login, partner_contacts.editable, update_partner_contact, partner_mail_cc, mail_cc_recipients, Kopie an den fünf Partner-Mails, Rollenbezeichnungen
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, Eingang 21./24.09. —
--   PART-062 „Rollen schlecht erklärt; kein Löschen und kein Bearbeiten; Felder optional → Legende der
--            Rollen; der Hauptkontakt kann Kontakte löschen und bearbeiten (z. B. E-Mail ändern); beim
--            neuen Kontakt alle Felder Pflicht"
--   PART-063 „Nur ‚weiterer Kontakt' → ‚weiterer operativer Kontakt' und neu ‚CC-Kontakt' (steht überall
--            in der Mailkommunikation in Kopie, operativ nicht eingebunden, z. B. Team-Lead); der
--            Mailversand berücksichtigt CC"
--
-- **Bearbeiten — wessen Daten.** Position und Rollen gehören zur Mitgliedschaft in *dieser*
-- Organisation; die ändert der Hauptkontakt (und das Partner-Team) jederzeit. Name und Adresse
-- gehören zur **Person**, und die gibt es plattformweit nur einmal: dieselbe Zeile kann Talent,
-- Speaker oder Kontakt einer zweiten Organisation sein. Deshalb dieselbe Regel wie in 0139
-- (Speaker-Pflege durch Partner): Name und Adresse pflegt eine Organisation nur bei einer Person,
-- **die sie selbst angelegt hat**, und nur **bis zum ersten Login** — danach pflegt die Person sie
-- selbst. Das Kennzeichen `org_membership.partner_editable_until_login` setzt
-- `partner_contact_upsert_internal`, wenn es die Person im selben Aufruf anlegt; eine über die
-- Adresse gefundene, schon vorhandene Person bekommt es nicht.
-- Bestand (geprüft 24.09.): 4 Mitgliedschaften, alle mit Login — `false` ist für alle richtig,
-- keine Übernahme nötig.
--
-- **Adresse ändern** heißt praktisch: die Einladung ging an eine falsche Adresse; die Person hat
-- sich also noch nie angemeldet. Die Adresse wird ersetzt, eine noch wartende Einladung zieht auf
-- die neue Adresse um (mit dem korrigierten Vornamen), eine schon verschickte wird neu gestellt.
-- Gehört die neue Adresse schon einem anderen Profil: P0001 `email_in_use` — das ist dann eine
-- andere Person, und die lädt man ein, statt dieses Profil umzuschreiben.
--
-- **Löschen** gibt es schon (`remove_partner_contact`: Mitgliedschaft und Zugang enden, die
-- Person bleibt). In der Oberfläche hieß es „Entfernen"; kein Datenbankanteil.
--
-- **CC-Kontakt.** Die Rolle `cc` steht seit Welle 1 im Vokabular; die Oberfläche kannte sie nicht,
-- und keine Mail berücksichtigte sie. Kopie heißt echte Kopie: der Versand (`lib/mail/queue.ts`)
-- setzt einen Cc-Kopf.
--   * **Im Protokoll stehen Personen, keine Adressen** (`mail_log.meta.cc_person_ids`). Grund:
--     `anonymize_person()` räumt beim Profil-Löschen `to_email` und `meta.vars` der *eigenen*
--     Mails — eine Adresse in der Kopie einer *fremden* Mail bliebe stehen. Die Adressen löst
--     erst der Versand auf (`mail_cc_recipients`, nur service_role): gelöschte Personen und
--     gesperrte Adressen fallen dabei weg, eine inzwischen korrigierte Adresse zählt.
--   * **An genau einer Mail** — der an den Hauptkontakt, ohne Hauptkontakt der an die handelnde
--     Person. Hinge die Kopie an jeder Zeile, bekäme der CC-Kontakt dieselbe Nachricht zweimal.
--   * **Nur, wer nicht operativ mitarbeitet.** Wer neben `cc` auch `primary_ops` oder `additional`
--     hat, bekommt die Mails ohnehin selbst.
--   * **Nie an der Einladung** (`partner_contact_invite`) — die ist persönlich.
--   * Betroffen sind die fünf Mails an Partner: Bestellung bestätigt (`shop_confirm`) und
--     abgeschlossen (`run_shop_finalization`), Lieferung eingegangen (`submit_deliverable`) und
--     zurückgewiesen (`review_deliverable`), Erinnerungs-Digest (`send_partner_reminders`). Jede
--     wortgleich aus dem Snapshot, geändert ist nur `perform queue_mail` → `v_mail := queue_mail`
--     und die Zeile mit `partner_mail_cc`.
--   * „Erneut senden" im Mail-Protokoll (`requeue_mail`) bleibt ohne Kopie: es schickt einer
--     Person die Mail noch einmal, die anderen haben sie schon.
--
-- **Rollenbezeichnungen** kommen jetzt aus dem Vokabular (Portal-Regel 8), in Partnerportal und
-- Admin gleich; Konrads Wortlaut für `additional` und `cc`, „Hauptkontakt" ohne „(Operations)".

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Struktur

alter table org_membership add column if not exists partner_editable_until_login boolean not null default false;
comment on column org_membership.partner_editable_until_login is
  'Die Organisation hat die Person selbst angelegt: Name und Adresse darf sie pflegen, bis die Person sich zum ersten Mal anmeldet (PART-062, Regel wie 0139).';

-- ---------------------------------------------------------------- 2) Rollenbezeichnungen

update vocab_term set label_de = 'Hauptkontakt', label_en = 'Primary contact', updated_at = now()
 where vocabulary = 'contact_role' and key = 'primary_ops';
update vocab_term set label_de = 'Weiterer operativer Kontakt', label_en = 'Additional operational contact', updated_at = now()
 where vocabulary = 'contact_role' and key = 'additional';
update vocab_term set label_de = 'CC-Kontakt', label_en = 'CC contact', updated_at = now()
 where vocabulary = 'contact_role' and key = 'cc';

-- ---------------------------------------------------------------- 3) Kopie an eine Mail hängen

-- Intern: nur aus den Partner-Mail-Funktionen. Für `authenticated` gesperrt — sonst könnte jede
-- angemeldete Person die CC-Kontakte einer beliebigen Organisation an eine fremde Mail hängen.
create or replace function partner_mail_cc(p_mail_id bigint, p_org_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_empf uuid; v_ids jsonb; v_n integer;
begin
  if p_mail_id is null or p_org_id is null then return 0; end if;
  -- Nur an eine wartende Mail: eine unterdrückte oder schon verschickte bekommt nichts angehängt.
  select person_id into v_empf from mail_log where id = p_mail_id and status = 'queued';
  if not found then return 0; end if;
  select coalesce(jsonb_agg(x.person_id order by x.person_id), '[]'::jsonb), count(*)::integer into v_ids, v_n
    from (select distinct om.person_id
            from org_membership om
            join person p on p.id = om.person_id and p.deleted_at is null
            join person_email pe on pe.person_id = p.id and pe.is_primary
           where om.org_id = p_org_id
             and om.roles @> '{cc}'
             and not (om.roles && '{primary_ops,additional}'::text[])
             and om.person_id is distinct from v_empf
             and not is_suppressed(pe.email::text)) x;
  if v_n = 0 then return 0; end if;
  update mail_log set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('cc_person_ids', v_ids), updated_at = now()
   where id = p_mail_id;
  return v_n;
end $$;
revoke execute on function partner_mail_cc(bigint, uuid) from public, anon, authenticated;

-- Für den Versand (service_role): die Adressen zu den Personen einer Kopie, erst beim Senden.
-- Gelöschte Personen und gesperrte Adressen fallen weg — fail-closed wie beim Empfänger.
create or replace function mail_cc_recipients(p_person_ids uuid[])
 returns table (email text)
 language sql
 stable
 security definer
 set search_path = public, extensions
as $$
  select distinct pe.email::text
    from person_email pe
    join person p on p.id = pe.person_id and p.deleted_at is null
   where pe.person_id = any(coalesce(p_person_ids, '{}'::uuid[]))
     and pe.is_primary
     and not is_suppressed(pe.email::text)
$$;
revoke execute on function mail_cc_recipients(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4) Kontakt bearbeiten

-- NULL bei Name, Adresse oder Rollen heißt „unverändert". Die Position ist Pflicht wie beim
-- Einladen (PART-062). Rollen gehen über `set_contact_roles` — dieselben Regeln (Hauptkontakt
-- nur übertragen, nie zwei), dasselbe Audit.
create or replace function update_partner_contact(p_org_id uuid, p_person_id uuid, p_position text,
                                                  p_first_name text default null, p_last_name text default null,
                                                  p_email text default null, p_roles text[] default null)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare
  v_me uuid := current_person_id(); v_om org_membership; v_p person; v_alt citext; v_neu citext;
  v_first text; v_last text; v_pos text; v_felder text[] := '{}'; v_org_name text; v_n integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_om from org_membership where org_id = p_org_id and person_id = p_person_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  select * into v_p from person where id = p_person_id and deleted_at is null for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  v_pos := nullif(btrim(coalesce(p_position, '')), '');
  if v_pos is null then raise exception 'position_required' using errcode = '22023'; end if;
  select pe.email into v_alt from person_email pe where pe.person_id = p_person_id and pe.is_primary limit 1;

  v_first := case when p_first_name is null then v_p.first_name else nullif(btrim(p_first_name), '') end;
  v_last  := case when p_last_name  is null then v_p.last_name  else nullif(btrim(p_last_name), '')  end;
  v_neu   := case when p_email      is null then v_alt          else lower(btrim(p_email))::citext  end;
  if v_first is distinct from v_p.first_name then v_felder := array_append(v_felder, 'first_name'); end if;
  if v_last  is distinct from v_p.last_name  then v_felder := array_append(v_felder, 'last_name');  end if;
  if v_neu   is distinct from v_alt          then v_felder := array_append(v_felder, 'email');      end if;

  -- Name und Adresse gehören der Person: nur bei selbst angelegten und nur bis zum ersten Login.
  if cardinality(v_felder) > 0 then
    if not (v_om.partner_editable_until_login and v_p.auth_user_id is null) then
      raise exception 'contact_not_editable' using errcode = 'P0001';
    end if;
    if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  end if;
  if 'email' = any(v_felder) then
    if v_neu is null or v_neu::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
    if is_suppressed(v_neu::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
    if exists (select 1 from person_email pe where pe.email = v_neu and pe.person_id <> p_person_id) then
      raise exception 'email_in_use' using errcode = 'P0001';
    end if;
  end if;

  if 'first_name' = any(v_felder) or 'last_name' = any(v_felder) then
    update person set first_name = v_first, last_name = v_last where id = p_person_id;
  end if;
  if 'email' = any(v_felder) then
    update person_email set email = v_neu, verified = false where person_id = p_person_id and is_primary;
    if not found then
      insert into person_email (person_id, email, is_primary, verified) values (p_person_id, v_neu, true, false);
    end if;
  end if;
  if v_pos is distinct from v_om.contact_position then
    update org_membership set contact_position = v_pos where id = v_om.id;
    v_felder := array_append(v_felder, 'position');
  end if;

  -- Die Einladung soll zur korrigierten Adresse gehen und den richtigen Vornamen tragen: eine
  -- wartende zieht um, eine schon verschickte wird neu gestellt.
  if 'email' = any(v_felder) or 'first_name' = any(v_felder) then
    update mail_log
       set to_email = coalesce(v_neu, to_email),
           meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{vars,first_name}', to_jsonb(coalesce(v_first, ''))),
           updated_at = now()
     where template_key = 'partner_contact_invite' and person_id = p_person_id and related_id = v_om.id and status = 'queued';
    get diagnostics v_n = row_count;
    if v_n = 0 and 'email' = any(v_felder) then
      select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
      perform queue_mail('partner_contact_invite', p_person_id, jsonb_build_object('org_name', v_org_name), 'org_membership', v_om.id);
      update org_membership set invited_at = now() where id = v_om.id;
    end if;
  end if;

  if p_roles is not null
     and (select coalesce(array_agg(x order by x), '{}') from unnest(p_roles) x)
         is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(v_om.roles) x) then
    perform set_contact_roles(p_org_id, p_person_id, p_roles);
  end if;

  -- Welche Felder, nicht welche Werte: die Adresse gehört nicht ins Audit.
  if cardinality(v_felder) > 0 then
    perform log_audit('partner.contact_update', 'organization', p_org_id::text,
                      jsonb_build_object('person_id', p_person_id),
                      jsonb_build_object('person_id', p_person_id, 'fields', to_jsonb(v_felder)));
  end if;
end $$;

-- ---------------------------------------------------------------- 5) Geänderte Funktionen (Live-Fassung aus dem Snapshot)

-- Kennzeichen setzen, wenn die Person in diesem Aufruf entsteht.
create or replace function partner_contact_upsert_internal(p_org_id uuid, p_email text, p_first_name text, p_last_name text, p_roles text[], p_position text, p_edition_id uuid, p_actor uuid, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_email citext; v_pid uuid; v_mid uuid; v_role text; v_org_name text; v_new boolean := false;
        v_person_neu boolean := false;
begin
  if p_roles is null or cardinality(p_roles) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_role in array p_roles loop
    if not is_vocab_key('contact_role', v_role) then raise exception 'invalid_role' using errcode = '22023', detail = v_role; end if;
  end loop;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
  select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id where pe.email = v_email and p.deleted_at is null limit 1;
  if v_pid is null then
    insert into person (first_name, last_name, source_first, tier)
    values (nullif(btrim(coalesce(p_first_name, '')), ''), nullif(btrim(coalesce(p_last_name, '')), ''), coalesce(p_source, 'partner_portal'), 'lead') returning id into v_pid;
    insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    -- Nur eine Person, die es ohne diese Organisation nicht gaebe, darf sie spaeter pflegen (PART-062).
    v_person_neu := true;
  end if;
  if 'primary_ops' = any(p_roles) and exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id <> v_pid and om.roles @> '{primary_ops}') then
    raise exception 'primary_exists' using errcode = 'P0001';
  end if;
  select id into v_mid from org_membership where org_id = p_org_id and person_id = v_pid;
  if v_mid is null then
    insert into org_membership (person_id, org_id, roles, contact_position, invited_at, partner_editable_until_login)
    values (v_pid, p_org_id, p_roles, nullif(btrim(coalesce(p_position, '')), ''), now(), v_person_neu) returning id into v_mid;
    v_new := true;
  else
    update org_membership set roles = p_roles, contact_position = coalesce(nullif(btrim(coalesce(p_position, '')), ''), contact_position) where id = v_mid;
  end if;
  if not exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = p_org_id
                   and (ra.valid_to is null or ra.valid_to > now())) then
    insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, granted_by, note)
    values (v_pid, 'partner_contact', 'org', p_org_id, p_edition_id, edition_valid_to(p_edition_id), p_actor, coalesce(p_source, 'partner_portal'));
  end if;
  if v_new then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
    perform queue_mail('partner_contact_invite', v_pid, jsonb_build_object('org_name', v_org_name), 'org_membership', v_mid);
  end if;
  return v_pid;
end $$;

-- Lieferung eingegangen: Kopie an der Mail an den Hauptkontakt.
create or replace function submit_deliverable(p_deliverable_id uuid, p_asset_ids uuid[] DEFAULT '{}'::uuid[], p_answers jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_d deliverable; v_oe org_edition; v_t deliverable_template; v_org_name text; v_primary uuid; v_locale text; r record; f jsonb; v_mail bigint;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_d from deliverable where id = p_deliverable_id for update;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  if not partner_can_edit(v_oe.org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_d.status not in ('open', 'rejected', 'overdue') then raise exception 'not_editable' using errcode = 'P0001', detail = v_d.status; end if;
  select * into v_t from deliverable_template where id = v_d.template_id;
  if v_t.fulfilled_by_sku is not null and not is_partner_team() then
    raise exception 'fulfilled_by_order' using errcode = 'P0001', detail = v_t.fulfilled_by_sku;
  end if;
  if v_t.type = 'upload' then
    if p_asset_ids is null or cardinality(p_asset_ids) = 0 then raise exception 'asset_required' using errcode = '22023'; end if;
    if exists (select 1 from unnest(p_asset_ids) x where not exists (select 1 from partner_asset a where a.id = x and a.org_edition_id = v_oe.id)) then
      raise exception 'asset_not_found' using errcode = 'P0002';
    end if;
    update partner_asset set deliverable_id = p_deliverable_id where id = any(p_asset_ids) and deliverable_id is null;
  elsif v_t.type = 'form' then
    if p_answers is null or p_answers = '{}'::jsonb then raise exception 'answers_required' using errcode = '22023'; end if;
    if v_t.answers_schema is not null and jsonb_typeof(v_t.answers_schema) = 'array' then
      for f in select * from jsonb_array_elements(v_t.answers_schema) loop
        if coalesce((f->>'required')::boolean, false) and nullif(btrim(coalesce(p_answers->>(f->>'key'), '')), '') is null then
          raise exception 'answers_incomplete' using errcode = 'P0001', detail = f->>'key';
        end if;
      end loop;
    end if;
  end if;
  update deliverable set status = 'submitted', submitted_at = now(), submitted_by = v_me, asset_ids = coalesce(p_asset_ids, '{}'),
                         answers = coalesce(p_answers, '{}'::jsonb), review_note = null
   where id = p_deliverable_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_oe.org_id;
  select om.person_id into v_primary from org_membership om where om.org_id = v_oe.org_id and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    v_mail := queue_mail('partner_deliverable_received', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'deliverable', case when v_locale = 'en' then v_t.label_en else v_t.label_de end),
                       'deliverable', p_deliverable_id);
    -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
    if r.pid = coalesce(v_primary, v_me) then perform partner_mail_cc(v_mail, v_oe.org_id); end if;
  end loop;
  perform log_audit('partner.deliverable_submit', 'organization', v_oe.org_id::text, null, jsonb_build_object('deliverable_id', p_deliverable_id, 'key', v_d.key, 'assets', cardinality(coalesce(p_asset_ids, '{}'))));
end $$;

-- Lieferung zurückgewiesen: Kopie an der Mail an den Hauptkontakt.
create or replace function review_deliverable(p_deliverable_id uuid, p_accepted boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_d deliverable; v_oe org_edition; v_t deliverable_template; v_org_name text; v_primary uuid; v_locale text; r record; v_mail bigint;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_d from deliverable where id = p_deliverable_id for update;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  if v_d.status not in ('submitted', 'accepted') then raise exception 'not_pending' using errcode = 'P0001', detail = v_d.status; end if;
  if not p_accepted and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  select * into v_t from deliverable_template where id = v_d.template_id;
  update deliverable set status = case when p_accepted then 'accepted' else 'rejected' end, reviewed_by = current_person_id(), reviewed_at = now(),
                         review_note = nullif(btrim(p_note), '') where id = p_deliverable_id;
  update partner_asset set status = case when p_accepted then 'accepted' else 'rejected' end, reviewed_by = current_person_id(), reviewed_at = now(),
                           review_note = nullif(btrim(p_note), '')
   where deliverable_id = p_deliverable_id and is_current;
  if not p_accepted then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_oe.org_id;
    select om.person_id into v_primary from org_membership om where om.org_id = v_oe.org_id and om.roles @> '{primary_ops}';
    for r in select distinct x as pid from unnest(array_remove(array[v_d.submitted_by, v_primary], null)) x loop
      select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
      v_mail := queue_mail('partner_deliverable_rejected', r.pid,
                         jsonb_build_object('org_name', v_org_name, 'deliverable', case when v_locale = 'en' then v_t.label_en else v_t.label_de end, 'note', btrim(p_note)),
                         'deliverable', p_deliverable_id);
      -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
      if r.pid = coalesce(v_primary, v_d.submitted_by) then perform partner_mail_cc(v_mail, v_oe.org_id); end if;
    end loop;
  end if;
  perform log_audit(case when p_accepted then 'partner.deliverable_accept' else 'partner.deliverable_reject' end, 'organization', v_oe.org_id::text,
                    jsonb_build_object('status', v_d.status), jsonb_build_object('deliverable_id', p_deliverable_id, 'note', p_note));
end $$;

-- Bestellung bestätigt: Kopie an der Mail an den Hauptkontakt.
create or replace function shop_confirm(p_order_id uuid, p_note text DEFAULT NULL::text, p_po_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_phase jsonb; v_org_name text; v_primary uuid; r record; v_locale text;
        v_lines_de text; v_lines_en text; v_tot record; v_tz text; v_bad record; v_po text; v_mail bigint;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'editing') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  v_phase := shop_phase(v_oe.edition_id);
  if (v_phase->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001', detail = 'order phase ' || v_o.phase::text; end if;
  if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;
  update shop_order_line l set price_net_cents = coalesce(p.net_price_cents, l.price_net_cents), vat_rate = p.vat_rate, name_de = p.name_de, name_en = p.name_en, unit = p.unit, category = p.category
    from product p where p.sku = l.product_sku and l.order_id = p_order_id;

  -- Merch (S4): jede Zeile mit Schema muss vollständig konfiguriert sein.
  select l.product_sku as sku, merch_problem(p.merch_config, l.merch_config, l.qty) as problem
    into v_bad
    from shop_order_line l join product p on p.sku = l.product_sku
   where l.order_id = p_order_id
     and jsonb_array_length(merch_fields(p.merch_config)) > 0
     and merch_problem(p.merch_config, l.merch_config, l.qty) is not null
   order by l.created_at limit 1;
  if v_bad.sku is not null then
    raise exception 'merch_incomplete' using errcode = 'P0001', detail = v_bad.sku || ':' || v_bad.problem;
  end if;

  -- Eingabe schlägt Vorgabe schlägt das, was schon dranstand.
  v_po := coalesce(nullif(btrim(coalesce(p_po_number, '')), ''),
                   nullif(btrim(coalesce(v_o.po_number, '')), ''),
                   nullif(btrim(coalesce(v_oe.po_number, '')), ''));

  perform shop_reconcile_ledger(p_order_id, false);
  update shop_order
     set status = 'pending', confirmed_at = now(), confirmed_by = v_me,
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
         po_number = v_po
   where id = p_order_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_org;
  select e.timezone into v_tz from event e where e.id = v_oe.edition_id;
  select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
         string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
    into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = p_order_id;
  select * into v_tot from shop_order_totals(p_order_id);
  select om.person_id into v_primary from org_membership om where om.org_id = v_org and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    v_mail := queue_mail('shop_order_confirmed', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'order_no', v_o.order_no, 'phase', v_o.phase,
                                          'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end,
                                          'total_net', fmt_cents(v_tot.net_cents::integer, v_locale),
                                          'ends_at', mail_fmt_ts((v_phase->>'ends_at')::timestamptz, coalesce(v_tz, 'Europe/Berlin'), v_locale)),
                       'shop_order', p_order_id);
    -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
    if r.pid = coalesce(v_primary, v_me) then perform partner_mail_cc(v_mail, v_org); end if;
  end loop;
  perform log_audit('shop.confirm', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status),
                    jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'po_number', v_po));
  return jsonb_build_object('order_id', p_order_id, 'order_no', v_o.order_no, 'net_cents', v_tot.net_cents,
                            'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents, 'po_number', v_po);
end $$;

-- Bestellung abgeschlossen: Kopie an der Mail an den Hauptkontakt.
create or replace function run_shop_finalization()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_completed integer := 0; v_cancelled integer := 0; v_primary uuid; m record; v_locale text; v_org_name text; v_lines_de text; v_lines_en text; v_tot record; v_mail bigint;
begin
  for r in
    select o.*, oe.org_id, oe.edition_id
    from shop_order o join org_edition oe on oe.id = o.org_edition_id
    where o.status in ('draft', 'pending', 'editing')
      and exists (select 1 from deadline d
                   where d.edition_id = oe.edition_id
                     and d.key = shop_phase_deadline_key(o.phase)
                     and d.due_at < now())
    order by o.created_at
  loop
    if r.status = 'draft' or not exists (select 1 from shop_order_line where order_id = r.id) then
      perform shop_reconcile_ledger(r.id, true);
      update shop_order set status = 'cancelled', cancelled_at = now() where id = r.id;
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    begin
      perform shop_reconcile_ledger(r.id, false);
    exception when others then
      insert into audit_log (action, object_type, object_id, after) values ('shop.finalize_stock_conflict', 'shop_order', r.id::text, jsonb_build_object('error', sqlerrm));
    end;
    update shop_order set status = 'completed', completed_at = now() where id = r.id;
    v_completed := v_completed + 1;
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = r.org_id;
    select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
           string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
      into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = r.id;
    select * into v_tot from shop_order_totals(r.id);
    select om.person_id into v_primary from org_membership om where om.org_id = r.org_id and om.roles @> '{primary_ops}';
    for m in select distinct x as pid from unnest(array_remove(array[r.confirmed_by, v_primary], null)) x loop
      select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = m.pid;
      v_mail := queue_mail('shop_order_completed', m.pid,
                         jsonb_build_object('org_name', v_org_name, 'order_no', r.order_no, 'phase', r.phase,
                                            'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end, 'total_net', fmt_cents(v_tot.net_cents::integer, v_locale)),
                         'shop_order', r.id);
      -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
      if m.pid = coalesce(v_primary, r.confirmed_by) then perform partner_mail_cc(v_mail, r.org_id); end if;
    end loop;
  end loop;
  if v_completed > 0 or v_cancelled > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('shop.finalize', 'system', 'cron', jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled));
  end if;
  return jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled);
end $$;

-- Erinnerungs-Digest: Kopie an genau einer Mail je Organisation.
create or replace function send_partner_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; m record; v_n integer := 0; v_items_de text; v_items_en text; v_count integer; v_org_name text;
        v_mail bigint; v_primary uuid; v_cc_offen boolean;
begin
  for r in
    select oe.id as oe_id, oe.org_id, coalesce(e.timezone, 'Europe/Berlin') as tz
    from org_edition oe join event e on e.id = oe.edition_id
    where exists (select 1 from partner_digest_items(oe.id))
      and not exists (select 1 from mail_log ml
                      where ml.template_key = 'partner_reminder_digest' and ml.related_type = 'org_edition' and ml.related_id = oe.id
                        and ml.status <> 'failed' and ml.queued_at > now() - interval '7 days')
  loop
    select count(*),
           string_agg(format('- %s — %s', i.label_de,
                             case when i.status = 'rejected' then 'zurückgewiesen, bitte erneut einreichen'
                                  when i.due_at is null then 'offen'
                                  when i.due_at < now() then 'überfällig seit ' || mail_fmt_ts(i.due_at, r.tz, 'de')
                                  else 'fällig ' || mail_fmt_ts(i.due_at, r.tz, 'de') end), E'\n' order by i.due_at nulls last, i.sort),
           string_agg(format('- %s — %s', i.label_en,
                             case when i.status = 'rejected' then 'sent back, please resubmit'
                                  when i.due_at is null then 'open'
                                  when i.due_at < now() then 'overdue since ' || mail_fmt_ts(i.due_at, r.tz, 'en')
                                  else 'due ' || mail_fmt_ts(i.due_at, r.tz, 'en') end), E'\n' order by i.due_at nulls last, i.sort)
      into v_count, v_items_de, v_items_en
    from partner_digest_items(r.oe_id) i;
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = r.org_id;
    -- Der Digest geht an alle operativen Kontakte; die Kopie haengt an genau einem davon (PART-063).
    select om.person_id into v_primary from org_membership om join person p on p.id = om.person_id and p.deleted_at is null
     where om.org_id = r.org_id and om.roles @> '{primary_ops}';
    v_cc_offen := true;
    for m in
      select distinct om.person_id, coalesce(p.preferred_language, 'de') as locale
      from org_membership om join person p on p.id = om.person_id
      where om.org_id = r.org_id and om.roles && '{primary_ops,additional}'::text[] and p.deleted_at is null
    loop
      v_mail := queue_mail('partner_reminder_digest', m.person_id,
                         jsonb_build_object('org_name', v_org_name, 'count', v_count, 'items', case when m.locale = 'en' then v_items_en else v_items_de end),
                         'org_edition', r.oe_id);
      if v_cc_offen and v_mail is not null and (v_primary is null or m.person_id = v_primary) then
        perform partner_mail_cc(v_mail, r.org_id);
        v_cc_offen := false;
      end if;
    end loop;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('partner.reminder_digest', 'system', 'cron', jsonb_build_object('digests', v_n));
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 6) Kontaktliste mit Pflegerecht

-- Neue Spalte am Ende (42P13: der Rückgabetyp ändert sich, daher drop + create). Die
-- bisherigen Spalten bleiben in Reihenfolge und Bedeutung; der Test prüft eine davon.
drop function if exists partner_contacts(uuid);
create or replace function partner_contacts(p_org_id uuid)
 RETURNS TABLE(person_id uuid, first_name text, last_name text, title text, email text, contact_position text, roles text[], has_login boolean, invited_at timestamp with time zone, editable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           om.contact_position, om.roles, (p.auth_user_id is not null), om.invited_at,
           -- Name und Adresse pflegt die Organisation nur bei selbst angelegten Personen bis zum ersten Login.
           (om.partner_editable_until_login and p.auth_user_id is null)
    from org_membership om join person p on p.id = om.person_id
    where om.org_id = p_org_id and p.deleted_at is null
    order by ('primary_ops' = any(om.roles)) desc, p.last_name nulls last, p.first_name nulls last;
end $$;

select harden_definer_functions();
