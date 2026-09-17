-- =============================================================================
-- 0112 · Welle 6 · Mail-Vorlagen im Admin bearbeiten (ADM-029)
--     Angewendet von der Architektur-Session am 17.09.2026 als 20260917185108
--
-- Konrad am 17.09.: „Die Mail Templates sollten am besten zentral im Admin
-- Bereich für mich bearbeitbar sein. Wenn sie nur per Migration geändert werden
-- können, ist das schwierig. Man hat ja immer wieder kleine Änderungen."
--
-- Er hat recht, und es ist enger als es klingt: **ab dem Prozessstart am 01.11.
-- gehen diese Mails an echte Menschen.** Ein Tippfehler im Einladungstext
-- braucht heute eine Migration, eine Entwicklerin und ein Deployment.
--
-- **Der Punkt, an dem es gefährlich wird.** Vorlagen werden **beim Versand**
-- gerendert (`lib/mail/send.ts` → `loadTemplate`), nicht beim Einstellen in die
-- Warteschlange. Wer eine Vorlage ändert, ändert damit auch die Mails, die
-- gerade in `mail_log` auf `queued` stehen — stumm. Das ist kein Fehler des
-- Versands (so bleibt eine Korrektur wirksam, bevor die Mail rausgeht), aber es
-- darf niemandem passieren, ohne dass er es weiss.
--
-- Diese Migration löst das **nicht** durch ein Einfrieren, sondern durch
-- Sichtbarkeit: `mail_templates_admin()` liefert je Vorlage, **wie viele Mails
-- gerade darauf warten**. Die Oberfläche sagt es vor dem Speichern. Ein
-- Einfrieren wäre die schlechtere Antwort — dann bliebe der Tippfehler in den
-- wartenden Mails stehen, obwohl man ihn gerade behoben hat.
--
-- Dazu, wie von der Architektur-Session verlangt: `updated_by`, `updated_at`
-- und ein Audit-Eintrag mit **vollem Vorher- und Nachhertext**. Damit ist die
-- vorige Fassung jederzeit wiederherstellbar, ohne eine eigene Versionstabelle.
--
-- Die Versionsnummer steigt bei jeder Änderung. Sie steht in `mail_log.meta`
-- nicht drin — dafür nennt das Protokoll den Zeitpunkt, und der Audit-Eintrag
-- sagt, welche Fassung wann galt.
--
-- Rechte: **nur Admin.** Diese Texte gehen an alle; das ist keine Aufgabe, die
-- man nebenbei delegiert.
--
-- Fehlerschlüssel: 42501 ohne Admin · 22023 `invalid_locale` ·
-- 22023 `fields_required` (Betreff oder Text leer) · P0002 `template_not_found`.
--
-- Test: supabase/tests/v6_mail_vorlagen.sql
-- =============================================================================
set search_path = public, extensions;

alter table mail_template add column if not exists updated_by uuid references person (id) on delete set null;

-- `updated_at` stand bisher ohne Trigger da und blieb auf dem Anlagedatum.
drop trigger if exists trg_mail_template_updated on mail_template;
create trigger trg_mail_template_updated before update on mail_template
  for each row execute function set_updated_at();

comment on column mail_template.updated_by is
  'Wer die Vorlage zuletzt geaendert hat (0112). Der volle Vorher-/Nachhertext steht im Audit-Log.';

/**
 * Alle Vorlagen für die Pflegeseite — **mit der Zahl der wartenden Mails.**
 *
 * `queued` ist der Grund, warum diese Funktion existiert und nicht einfach ein
 * `select *` reicht: wer den Text ändert, ändert die wartenden Mails mit. Das
 * gehört in die Zeile, nicht in eine Fussnote.
 */
create or replace function mail_templates_admin()
returns table (key text, locale text, subject text, body_md text, description text,
               active boolean, version integer, updated_at timestamptz,
               updated_by_name text, queued integer, sent_30d integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.key, t.locale, t.subject, t.body_md, t.description, t.active, t.version, t.updated_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = t.updated_by),
           (select count(*)::integer from mail_log m
             where m.template_key = t.key and m.locale = t.locale and m.status = 'queued'),
           (select count(*)::integer from mail_log m
             where m.template_key = t.key and m.locale = t.locale
               and m.status in ('sent', 'delivered') and m.queued_at > now() - interval '30 days')
      from mail_template t
     order by t.key, t.locale;
end $$;

/**
 * Vorlage anlegen oder ändern.
 *
 * Leerer Betreff oder leerer Text werden abgewiesen: eine Vorlage, die nichts
 * sagt, ist schlimmer als gar keine — der Versand nähme sie trotzdem und
 * verschickte eine leere Mail.
 */
create or replace function upsert_mail_template(p_data jsonb) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_key text := nullif(btrim(p_data->>'key'), '');
        v_locale text := nullif(p_data->>'locale', '');
        v_subject text := nullif(btrim(p_data->>'subject'), '');
        v_body text := nullif(btrim(p_data->>'body_md'), '');
        v_before jsonb; v_version integer;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_key is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if v_locale not in ('de', 'en') then
    raise exception 'invalid_locale' using errcode = '22023', detail = coalesce(v_locale, 'null');
  end if;

  select to_jsonb(t) into v_before from mail_template t where t.key = v_key and t.locale = v_locale;

  if v_before is null then
    if v_subject is null or v_body is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'subject/body_md';
    end if;
    insert into mail_template (key, locale, version, subject, body_md, description, active, updated_by)
    values (v_key, v_locale, 1, v_subject, v_body,
            nullif(btrim(p_data->>'description'), ''),
            coalesce((p_data->>'active')::boolean, true), current_person_id())
    returning version into v_version;
  else
    -- Beim Ändern darf ein Feld fehlen (dann bleibt es), aber nicht leer sein.
    if (p_data ? 'subject' and v_subject is null) or (p_data ? 'body_md' and v_body is null) then
      raise exception 'fields_required' using errcode = '22023', detail = 'subject/body_md';
    end if;
    update mail_template set
      subject     = coalesce(v_subject, subject),
      body_md     = coalesce(v_body, body_md),
      description = case when p_data ? 'description' then nullif(btrim(p_data->>'description'), '') else description end,
      active      = coalesce((p_data->>'active')::boolean, active),
      version     = version + 1,
      updated_by  = current_person_id()
    where key = v_key and locale = v_locale
    returning version into v_version;
  end if;

  perform log_audit('mail_template.upsert', 'mail_template', v_key || '/' || v_locale, v_before,
                    jsonb_build_object('subject', coalesce(v_subject, v_before->>'subject'),
                                       'body_md', coalesce(v_body, v_before->>'body_md'),
                                       'version', v_version));
  return v_version;
end $$;

/**
 * Eine Vorlage auf eine frühere Fassung zurücksetzen.
 *
 * Nicht bequem, aber notwendig: wer einen Text versehentlich leert oder
 * verschlimmbessert, soll ihn zurückholen können, ohne dass jemand im
 * Audit-Log nachschlägt und von Hand abtippt. Der Aufrufer übergibt Betreff und
 * Text aus dem Protokoll; die Funktion schreibt sie als neue Fassung — die
 * Historie bleibt damit vollständig vorwärts lesbar.
 */
create or replace function restore_mail_template(p_key text, p_locale text, p_subject text, p_body_md text)
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from mail_template t where t.key = p_key and t.locale = p_locale) then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
  return upsert_mail_template(jsonb_build_object(
    'key', p_key, 'locale', p_locale, 'subject', p_subject, 'body_md', p_body_md));
end $$;

/**
 * Die letzten Fassungen einer Vorlage aus dem Audit-Log.
 *
 * Das Protokoll liest sonst nur `service_role`; hier kommt genau der Ausschnitt
 * heraus, den die Pflegeseite braucht — wer wann was geändert hat, mit dem
 * vollen Text davor, damit man ihn zurückholen kann.
 */
create or replace function mail_template_history(p_key text, p_locale text, p_limit integer default 10)
returns table (changed_at timestamptz, changed_by text, subject_before text, body_before text, version_after integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.created_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = a.actor_person_id),
           a.before->>'subject', a.before->>'body_md', (a.after->>'version')::integer
      from audit_log a
     where a.action = 'mail_template.upsert'
       and a.object_id = p_key || '/' || p_locale
       and a.before is not null
     order by a.created_at desc, a.id desc
     limit greatest(1, least(coalesce(p_limit, 10), 50));
end $$;

select harden_definer_functions();
