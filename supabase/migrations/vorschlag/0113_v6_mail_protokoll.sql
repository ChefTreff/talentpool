-- =============================================================================
-- 0113 · Welle 6 · Das Mail-Protokoll als Arbeitsmittel (ADM-030)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- `/admin/mail` zeigt heute zwanzig Zeilen, ohne Filter, ohne Detail, ohne
-- erneuten Versand. Die häufigste Frage im Support — **„ist die Mail
-- angekommen?"** — lässt sich damit nicht beantworten, und ab dem Prozessstart
-- am 01.11. wird sie täglich gestellt.
--
-- Drei Funktionen, eine Entscheidung:
--
-- * `mail_log_admin()` — filtern nach Person, Vorlage, Status und Zeitraum,
--   mit Gesamtzahl für das Blättern.
-- * `mail_log_detail()` — eine Zeile mit allem, auch den eingesetzten
--   Variablen. Die sind personenbezogen (Name, Session-Titel, Beträge),
--   deshalb nur Admin und nur einzeln.
-- * `requeue_mail()` — **erneut senden heisst neu einreihen.** Es entsteht
--   eine zweite `mail_log`-Zeile mit `queued`; versendet wird sie vom selben
--   Cron wie jede andere. Kein zweiter Versandweg, kein Sofortversand an der
--   Warteschlange vorbei (Entscheidung Architektur-Session 17.09.).
--
-- **Die alte Zeile bleibt unverändert.** Sie ist die Historie; wer nachsieht,
-- warum jemand eine Mail zweimal bekommen hat, findet beide. Die neue trägt
-- `resend_of` und zeigt damit auf ihren Anlass.
--
-- **Was nicht erneut geht:** `queued` (läuft schon — ein zweites Einreihen
-- wäre eine doppelte Mail) und `suppressed`. Bei `suppressed` steht in
-- `to_email` ohnehin nur noch der Hash; die Sperrliste gilt weiter, und der
-- Cron prüft sie unmittelbar vor dem Versand erneut.
--
-- Gerendert wird mit der **aktuellen** Fassung der Vorlage — dieselbe
-- Entscheidung wie in 0112. Die Oberfläche sagt das in der Rückfrage, sonst
-- wundert sich jemand, warum die zweite Mail anders aussieht als die erste.
--
-- Fehlerschlüssel: 42501 ohne Admin · P0002 `mail_not_found` ·
-- P0001 `not_resendable` (Status im Detail).
--
-- Test: supabase/tests/v6_mail_protokoll.sql
-- =============================================================================
set search_path = public, extensions;

/**
 * Das Protokoll, gefiltert.
 *
 * `total` steht in jeder Zeile: das Blättern braucht die Gesamtzahl, und ein
 * zweiter Aufruf nur zum Zählen wäre dieselbe Abfrage ein zweites Mal.
 */
create or replace function mail_log_admin(
  p_query text default null,
  p_template text default null,
  p_status text default null,
  p_person_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0)
returns table (id bigint, to_email text, person_id uuid, person_name text,
               template_key text, locale text, subject text, status text,
               error text, provider_id text, queued_at timestamptz, sent_at timestamptz,
               resend_of bigint, total bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Sonderzeichen entschärfen: die Eingabe kommt aus einem Suchfeld.
  if v_q is not null then
    v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select m.id, m.to_email::text, m.person_id,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = m.person_id),
           m.template_key, m.locale, m.subject, m.status, m.error, m.provider_id,
           m.queued_at, m.sent_at, (m.meta->>'resend_of')::bigint,
           count(*) over ()
      from mail_log m
     where (p_template is null or m.template_key = p_template)
       and (p_status is null or m.status = p_status)
       and (p_person_id is null or m.person_id = p_person_id)
       and (p_from is null or m.queued_at >= p_from)
       and (p_to is null or m.queued_at < p_to)
       and (v_q is null or m.to_email::text ilike v_q or m.subject ilike v_q)
     order by m.queued_at desc, m.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

/** Zahlen je Status für die Filterleiste — was es nicht gibt, bietet sie nicht an. */
create or replace function mail_log_stats(p_days integer default 30)
returns table (status text, anzahl bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select m.status, count(*)
      from mail_log m
     where m.queued_at > now() - make_interval(days => greatest(1, p_days))
     group by m.status order by count(*) desc;
end $$;

/**
 * Eine Zeile mit allem.
 *
 * `vars` sind die eingesetzten Variablen — Name, Session-Titel, manchmal
 * Beträge. Personenbezogen, deshalb nur einzeln und nur für Admin; in der
 * Liste stehen sie nicht.
 */
create or replace function mail_log_detail(p_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_m mail_log%rowtype;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_m from mail_log where id = p_id;
  if not found then raise exception 'mail_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', v_m.id, 'to_email', v_m.to_email::text, 'person_id', v_m.person_id,
    'person_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                      from person p where p.id = v_m.person_id),
    'template_key', v_m.template_key, 'locale', v_m.locale, 'subject', v_m.subject,
    'status', v_m.status, 'error', v_m.error, 'provider', v_m.provider, 'provider_id', v_m.provider_id,
    'related_type', v_m.related_type, 'related_id', v_m.related_id,
    'queued_at', v_m.queued_at, 'sent_at', v_m.sent_at,
    'attempts', coalesce((v_m.meta->>'attempts')::integer, 0),
    'resend_of', (v_m.meta->>'resend_of')::bigint,
    'vars', coalesce(v_m.meta->'vars', '{}'::jsonb),
    -- Kann diese Zeile erneut? Die Oberfläche soll den Knopf nicht anbieten,
    -- wenn die Antwort nein ist.
    'resendable', v_m.status in ('sent', 'failed', 'delivered'));
end $$;

/**
 * Erneut senden = neu einreihen.
 *
 * Die alte Zeile bleibt, wie sie ist. Die neue trägt dieselben Angaben und in
 * `meta` den Verweis auf ihren Anlass; versendet wird sie vom Cron, der die
 * Sperrliste unmittelbar davor noch einmal prüft.
 */
create or replace function requeue_mail(p_log_id bigint) returns bigint
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_m mail_log%rowtype; v_neu bigint;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_m from mail_log where id = p_log_id;
  if not found then raise exception 'mail_not_found' using errcode = 'P0002'; end if;
  if v_m.status not in ('sent', 'failed', 'delivered') then
    raise exception 'not_resendable' using errcode = 'P0001', detail = v_m.status;
  end if;

  insert into mail_log (to_email, person_id, template_key, locale, status, meta, related_type, related_id)
  values (v_m.to_email, v_m.person_id, v_m.template_key, v_m.locale, 'queued',
          jsonb_build_object('vars', coalesce(v_m.meta->'vars', '{}'::jsonb),
                             'attempts', 0, 'resend_of', v_m.id),
          v_m.related_type, v_m.related_id)
  returning id into v_neu;

  perform log_audit('mail.requeue', 'mail_log', v_neu::text,
                    jsonb_build_object('id', v_m.id, 'status', v_m.status),
                    jsonb_build_object('id', v_neu, 'template_key', v_m.template_key));
  return v_neu;
end $$;

select harden_definer_functions();
