-- 0276 · Mail verzögert (v6_mail_verzoegert): Warteschlange mit Frist, Stornieren und die Änderungsmail für veröffentlichte Slots.
--
-- Anlass: LEAD-063 (Konrad & Leopold 05.10., Durchgang Partner-Portal): „Wird ein veröffentlichter Slot verschoben oder geändert,
-- bekommen Speaker (und ggf. Partner der Session) eine Mail mit alt/neu — mehrere Änderungen = eine Mail.“ Plan-Entscheidung 08.10.
-- (entscheidungen.md): dieselbe Warteschlange, 15 Minuten, Dedupe, Folgeänderungen aktualisieren die wartende Zeile; Speaker- und
-- Partner-Chat teilen sich die Hilfsfunktionen — PART-124 (Zusage-Mail, 10 Minuten, Rücknahme storniert) nutzt `queue_mail_debounced`
-- und `cancel_queued_mail`. Plan-OK zum Vorschlag 08.10. (a)–(d): alle vier Rollen aus `session_speaker`, festes Fenster, keine Mail
-- ohne handelnde Person, Zeile in datenschutz-verarbeitungen.md.
--
-- Was die Migration tut
--   1  `mail_log.send_after` (leer = beim nächsten Lauf) und der Status `cancelled`; `mail_log_detail` nennt beides (additiv).
--      Der Versandlauf (`lib/mail/queue.ts`) lädt nur Zeilen ohne `send_after` oder mit erreichter Zeit — **die Migration muss vor dem
--      Merge live sein**, sonst fragt der Lauf eine Spalte ab, die es nicht gibt.
--   2  Drei interne Hilfsfunktionen (EXECUTE nur für service_role und Definer-Aufrufer), `queue_mail` selbst bleibt unverändert:
--        queue_mail_debounced(Vorlage, Person, Variablen, Bezugsart, Bezug, Frist, Präfix) — legt die Mail mit `send_after = now() + Frist`
--          an; gibt es für (Vorlage, Bezug, Person) schon eine wartende Zeile, ersetzt es deren Variablen (Schlüssel mit dem Präfix, Standard
--          `alt_`, behält die Zeile) und lässt `send_after` stehen. Advisory-Lock je Schlüssel; für eine gesperrte Adresse höchstens eine
--          `suppressed`-Zeile je Fenster.
--        queue_speaker_mail_debounced(…, Profil, …) — dasselbe mit der Speaker-Weiche (`speaker_mail_recipient`, `on_behalf_of`).
--        cancel_queued_mail(Vorlage, Bezug, Person, Grund) — setzt wartende Zeilen auf `cancelled` (Grund in `meta.cancel_reason`) und
--          entfernt `side_event_token` aus `meta.vars` (Liste = lib/mail/geheimnisse.ts, der Test hält sie gleich).
--   3  Änderungsmail LEAD-063: Trigger `trg_slot_session_change_mail` (slot: start_at, end_at, stage_id) und `trg_session_change_mail`
--      (session: title_de, title_en, slot_id). Nur bei veröffentlichter Session (Titel: vorher und nachher) und nur, wenn eine Person
--      handelt (`current_person_id()`; Skripte, Migrationen und die Service-Rolle schicken nichts). Empfänger: alle `session_speaker`
--      der Session (speaker, moderator, host, panelist) — mit Profil über die Weiche, ohne Profil direkt; bei `session.partner_org_id`
--      zusätzlich der Hauptkontakt (`primary_ops`) der Organisation mit CC-Kontakten (`partner_mail_cc`). Fenster **fest 15 Minuten**
--      ab der ersten Änderung; Folgeänderungen aktualisieren die wartende Zeile (`alt_*` bleibt, `changes` wird neu gerechnet); führt
--      eine Folge zum alten Stand zurück oder ist in der Sprache der Mail nichts mehr zu sehen, wird die Zeile `cancelled`
--      (`unchanged`); wer inzwischen nicht mehr zur Session gehört, wird `cancelled` (`no_longer_recipient`). Ein Fehler im Mailweg bricht
--      die Programmänderung nie ab (Warnung statt Abbruch). Audit `mail.session_change` mit person_id und session_id, ohne Adresse.
--      Vorlagen `session_changed` und `session_changed_partner` (DE/EN).
--
-- Abweichungen von der Richtung vom 08.10. (von Plan bestätigt): Schlüssel der wartenden Mail ist die **Session** statt des Slots
-- (die Mail beschreibt die Session; der Schlüssel bleibt stabil, wenn sie den Slot wechselt; eine Session liegt auf genau einem Slot).
--
-- Randlagen (im PR benannt): (i) eine Änderung in der Sekunde, in der der Versandlauf eine schon fällige Zeile geladen hat, erreicht die
-- Mail nicht mehr — sie nennt dann den Vorgängerstand, das Portal zeigt den aktuellen; (ii) wird jemand in der Wartezeit von der Session
-- entfernt, wird seine wartende Mail erst bei der nächsten Änderung storniert; (iii) eine Titeländerung im Freigabefluss
-- (published → review) löst keine Mail aus, der Speaker ist dort selbst Autor.
set search_path = public, extensions;

-- === 1 · Schema ================================================================================================================
alter table mail_log add column if not exists send_after timestamptz;
comment on column mail_log.send_after is
  'Frühester Versandzeitpunkt (LEAD-063, PART-124): leer = beim nächsten Lauf; sonst lädt der Versandlauf (lib/mail/queue.ts) die Zeile erst, wenn die Zeit erreicht ist. Gesetzt von queue_mail_debounced. Der Lauf kommt alle zehn Minuten, die reale Verzögerung ist also die Frist bis Frist + 10 Minuten.';

alter table mail_log drop constraint if exists mail_log_status_check;
alter table mail_log add constraint mail_log_status_check
  check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed', 'cancelled'));

-- mail_log_detail: additiv `send_after` und `cancel_reason` (Basis: Snapshot).
create or replace function mail_log_detail(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
    'queued_at', v_m.queued_at, 'send_after', v_m.send_after, 'sent_at', v_m.sent_at,
    'attempts', coalesce((v_m.meta->>'attempts')::integer, 0),
    'resend_of', (v_m.meta->>'resend_of')::bigint,
    'cancel_reason', v_m.meta->>'cancel_reason',
    'vars', coalesce(v_m.meta->'vars', '{}'::jsonb),
    -- Kann diese Zeile erneut? Die Oberfläche soll den Knopf nicht anbieten,
    -- wenn die Antwort nein ist.
    'resendable', v_m.status in ('sent', 'failed', 'delivered'));
end $$;

-- === 2 · Hilfsfunktionen: wartende Mail anlegen/aktualisieren, stornieren ======================================================
-- Sprache einer Mail an diese Person — genau die Regel aus `queue_mail` (Snapshot): bevorzugte Sprache, sonst Englisch für Speaker und
-- Assistenz, sonst Deutsch. Der Test legt eine Mail über `queue_mail` an und gleicht beide ab.
create or replace function mail_locale_for(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end,
                  case when exists (select 1 from speaker_profile sp where sp.person_id = p.id or is_speaker_assistant(sp.id, p.id)) then 'en' else 'de' end)
    from person p where p.id = p_person_id
$$;
comment on function mail_locale_for(uuid) is 'Sprache einer Mail an diese Person, dieselbe Regel wie queue_mail (bevorzugte Sprache, sonst Englisch für Speaker/Assistenz, sonst Deutsch).';

create or replace function queue_mail_debounced(
  p_template_key text, p_person_id uuid, p_vars jsonb default '{}'::jsonb, p_related_type text default null,
  p_related_id uuid default null, p_delay interval default interval '15 minutes', p_keep_prefix text default 'alt_')
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_row mail_log%rowtype; v_id bigint; v_vars jsonb; v_keep jsonb;
begin
  if nullif(btrim(coalesce(p_template_key, '')), '') is null or p_person_id is null then
    raise exception 'invalid_mail_key' using errcode = '22023';
  end if;
  if p_related_id is null then raise exception 'related_id_required' using errcode = '22023'; end if;
  if p_delay is null or p_delay <= interval '0' or p_delay > interval '24 hours' then
    raise exception 'invalid_delay' using errcode = '22023';
  end if;
  -- Ein Schlüssel nach dem anderen: zwei gleichzeitige Aufrufe legen nicht zwei wartende Zeilen an.
  perform pg_advisory_xact_lock(hashtextextended('mail_debounce:' || p_template_key || ':' || p_related_id::text || ':' || p_person_id::text, 0));

  select * into v_row from mail_log
   where template_key = p_template_key and related_id = p_related_id and person_id = p_person_id and status = 'queued'
   order by id desc limit 1 for update;
  if found then
    -- Wartende Zeile: Variablen aktualisieren. Bleiben soll, was die Zeile schon trägt (`first_name`, `on_behalf_of`, …) und jeder
    -- Schlüssel mit dem Präfix (bei der Änderungsmail der Stand vor der ersten Änderung); `send_after` bleibt (festes Fenster).
    v_keep := '{}'::jsonb;
    if nullif(p_keep_prefix, '') is not null then
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_keep
        from jsonb_each(coalesce(v_row.meta->'vars', '{}'::jsonb)) e where starts_with(e.key, p_keep_prefix);
    end if;
    v_vars := coalesce(v_row.meta->'vars', '{}'::jsonb) || coalesce(p_vars, '{}'::jsonb) || v_keep;
    update mail_log set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('vars', v_vars), updated_at = now() where id = v_row.id;
    return v_row.id;
  end if;

  -- Gesperrte Adresse: `queue_mail` schreibt eine `suppressed`-Zeile; je Fenster genügt eine.
  if exists (select 1 from mail_log where template_key = p_template_key and related_id = p_related_id and person_id = p_person_id
                and status = 'suppressed' and queued_at > now() - p_delay) then
    return null;
  end if;
  v_id := queue_mail(p_template_key, p_person_id, p_vars, p_related_type, p_related_id);
  if v_id is null then return null; end if;
  update mail_log set send_after = now() + p_delay where id = v_id and status = 'queued';
  return v_id;
end $$;
comment on function queue_mail_debounced(text, uuid, jsonb, text, uuid, interval, text) is
  'Wartende Mail anlegen oder aktualisieren (LEAD-063, PART-124): legt die Mail mit send_after = now() + Frist an; gibt es für (Vorlage, Bezug, Person) schon eine wartende Zeile, werden ihre Variablen ersetzt (Schlüssel mit dem Präfix behält die Zeile) und send_after bleibt. Antwort: Mail-Id oder null (keine Adresse, Person gelöscht, gesperrte Adresse im selben Fenster). Intern.';

create or replace function queue_speaker_mail_debounced(
  p_template_key text, p_profile_id uuid, p_vars jsonb default '{}'::jsonb, p_related_type text default null,
  p_related_id uuid default null, p_delay interval default interval '15 minutes', p_keep_prefix text default 'alt_')
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_person uuid; v_an uuid; v_name text;
begin
  select sp.person_id into v_person from speaker_profile sp where sp.id = p_profile_id;
  if v_person is null then return null; end if;
  v_an := speaker_mail_recipient(p_profile_id);
  if v_an is distinct from v_person then
    select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_name
      from person p where p.id = v_person;
    return queue_mail_debounced(p_template_key, v_an,
                                coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('on_behalf_of', coalesce(v_name, '')),
                                p_related_type, p_related_id, p_delay, p_keep_prefix);
  end if;
  return queue_mail_debounced(p_template_key, v_person, p_vars, p_related_type, p_related_id, p_delay, p_keep_prefix);
end $$;
comment on function queue_speaker_mail_debounced(text, uuid, jsonb, text, uuid, interval, text) is
  'Wie queue_mail_debounced, mit der Speaker-Weiche von queue_speaker_mail (speaker_mail_recipient, on_behalf_of). Intern.';

create or replace function cancel_queued_mail(p_template_key text, p_related_id uuid, p_person_id uuid default null, p_reason text default null)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if nullif(btrim(coalesce(p_template_key, '')), '') is null or p_related_id is null then
    raise exception 'invalid_mail_key' using errcode = '22023';
  end if;
  -- Nur Zeilen im Status `queued`: eine versendete Mail lässt sich nicht zurückholen. Der Token einer One-Click-Mail gehört nicht in
  -- ein Protokoll, das Admins lesen (Liste wie lib/mail/geheimnisse.ts).
  with c as (
    update mail_log m
       set status = 'cancelled',
           meta = jsonb_set(
                    coalesce(m.meta, '{}'::jsonb)
                      || jsonb_build_object('cancelled_at', now(), 'cancel_reason', nullif(btrim(coalesce(p_reason, '')), '')),
                    '{vars}', coalesce(m.meta->'vars', '{}'::jsonb) - 'side_event_token'),
           updated_at = now()
     where m.status = 'queued' and m.template_key = p_template_key and m.related_id = p_related_id
       and (p_person_id is null or m.person_id = p_person_id)
    returning 1)
  select count(*)::integer into v_n from c;
  return v_n;
end $$;
comment on function cancel_queued_mail(text, uuid, uuid, text) is
  'Wartende Mail stornieren (LEAD-063, PART-124): Zeilen im Status queued für (Vorlage, Bezug [, Person]) werden cancelled, der Grund steht in meta.cancel_reason, side_event_token wird aus meta.vars entfernt. Antwort: Zahl der stornierten Zeilen; eine schon versendete Mail bleibt unberührt. Intern.';

-- === 3 · Änderungsmail für veröffentlichte Slots (LEAD-063) =====================================================================
-- Stand einer Session für den Vergleich: Titel, Zeit und Bühne des Slots `p_slot_id`.
create or replace function session_change_state(p_title_de text, p_title_en text, p_slot_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object('title_de', p_title_de, 'title_en', p_title_en,
                            'start_at', sl.start_at, 'end_at', sl.end_at, 'stage_id', st.id, 'stage_name', st.name)
    from (select 1) x
    left join slot sl on sl.id = p_slot_id
    left join stage st on st.id = sl.stage_id
$$;

-- Die Zeilen der Mail: nur, was sich in der Sprache der Mail sichtbar geändert hat (Zeit, Bühne, Titel). Leer = nichts zu melden.
create or replace function session_change_lines(p_alt jsonb, p_new jsonb, p_tz text, p_locale text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_en boolean := (p_locale = 'en');
  v_tz text := coalesce(p_tz, 'Europe/Berlin');
  v_lines text[] := '{}';
  v_a_start timestamptz := nullif(p_alt->>'start_at', '')::timestamptz;
  v_a_end   timestamptz := nullif(p_alt->>'end_at', '')::timestamptz;
  v_n_start timestamptz := nullif(p_new->>'start_at', '')::timestamptz;
  v_n_end   timestamptz := nullif(p_new->>'end_at', '')::timestamptz;
  v_a_title text; v_n_title text; v_a_time text; v_n_time text; v_a_stage text; v_n_stage text;
  v_open text := case when v_en then 'to be announced' else 'noch offen' end;
begin
  -- Titel in der Sprache der Mail (Rückfall auf die andere), einzeilig.
  v_a_title := regexp_replace(coalesce(case when v_en then coalesce(nullif(p_alt->>'title_en', ''), nullif(p_alt->>'title_de', ''))
                                            else coalesce(nullif(p_alt->>'title_de', ''), nullif(p_alt->>'title_en', '')) end, ''), '\s+', ' ', 'g');
  v_n_title := regexp_replace(coalesce(case when v_en then coalesce(nullif(p_new->>'title_en', ''), nullif(p_new->>'title_de', ''))
                                            else coalesce(nullif(p_new->>'title_de', ''), nullif(p_new->>'title_en', '')) end, ''), '\s+', ' ', 'g');

  if (v_a_start, v_a_end) is distinct from (v_n_start, v_n_end) then
    v_a_time := case when v_a_start is null or v_a_end is null then v_open
      when v_en then to_char(v_a_start at time zone v_tz, 'DD Mon YYYY, HH24:MI') || '–' || to_char(v_a_end at time zone v_tz, 'HH24:MI')
      else to_char(v_a_start at time zone v_tz, 'DD.MM.YYYY, HH24:MI') || '–' || to_char(v_a_end at time zone v_tz, 'HH24:MI') || ' Uhr' end;
    v_n_time := case when v_n_start is null or v_n_end is null then v_open
      when v_en then to_char(v_n_start at time zone v_tz, 'DD Mon YYYY, HH24:MI') || '–' || to_char(v_n_end at time zone v_tz, 'HH24:MI')
      else to_char(v_n_start at time zone v_tz, 'DD.MM.YYYY, HH24:MI') || '–' || to_char(v_n_end at time zone v_tz, 'HH24:MI') || ' Uhr' end;
    v_lines := v_lines || case when v_en then '- **Time:** before ' || v_a_time || ', now ' || v_n_time
                               else '- **Zeit:** bisher ' || v_a_time || ', jetzt ' || v_n_time end;
  end if;
  if (p_alt->>'stage_id') is distinct from (p_new->>'stage_id') then
    v_a_stage := coalesce(nullif(p_alt->>'stage_name', ''), v_open);
    v_n_stage := coalesce(nullif(p_new->>'stage_name', ''), v_open);
    v_lines := v_lines || case when v_en then '- **Stage:** before ' || v_a_stage || ', now ' || v_n_stage
                               else '- **Bühne:** bisher ' || v_a_stage || ', jetzt ' || v_n_stage end;
  end if;
  if v_a_title is distinct from v_n_title then
    v_lines := v_lines || case when v_en then '- **Title:** before “' || v_a_title || '”, now “' || v_n_title || '”'
                               else '- **Titel:** bisher „' || v_a_title || '“, jetzt „' || v_n_title || '“' end;
  end if;
  return array_to_string(v_lines, E'\n');
end $$;

-- Eine Mail an einen Empfänger anlegen, aktualisieren oder zurücknehmen. `p_profile` (Speaker mit Profil) geht über die Weiche,
-- `p_org_id` (Partner-Hauptkontakt) hängt die CC-Kontakte an. Antwort: Mail-Id oder null.
create or replace function session_change_queue(
  p_key text, p_target uuid, p_profile uuid, p_org_id uuid, p_session_id uuid, p_old jsonb, p_new jsonb, p_tz text, p_event text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_row mail_log%rowtype; v_had boolean; v_loc text; v_alt jsonb; v_lines text; v_vars jsonb; v_mail bigint; v_n integer; v_org text;
begin
  select * into v_row from mail_log
   where template_key = p_key and related_id = p_session_id and person_id = p_target and status = 'queued'
   order by id desc limit 1;
  v_had := found;
  v_loc := case when v_had and v_row.locale in ('de', 'en') then v_row.locale else mail_locale_for(p_target) end;
  -- Der Stand vor der ersten Änderung im Fenster: aus der wartenden Zeile, sonst der Stand vor dieser Änderung.
  v_alt := case when v_had then jsonb_build_object(
                  'title_de', v_row.meta->'vars'->'alt_title_de', 'title_en', v_row.meta->'vars'->'alt_title_en',
                  'start_at', v_row.meta->'vars'->'alt_start_at', 'end_at', v_row.meta->'vars'->'alt_end_at',
                  'stage_id', v_row.meta->'vars'->'alt_stage_id', 'stage_name', v_row.meta->'vars'->'alt_stage_name')
                else p_old end;
  v_lines := session_change_lines(v_alt, p_new, p_tz, v_loc);
  if v_lines = '' then
    -- Nichts (mehr) zu melden: die Folgeänderungen haben sich aufgehoben, oder die Änderung ist in dieser Sprache nicht sichtbar.
    v_n := cancel_queued_mail(p_key, p_session_id, p_target, 'unchanged');
    if v_n > 0 then
      perform log_audit('mail.session_change', 'session', p_session_id::text, null,
        jsonb_build_object('person_id', p_target, 'template', p_key, 'state', 'cancelled', 'reason', 'unchanged'));
    end if;
    return null;
  end if;
  v_vars := jsonb_build_object(
    'session_title', regexp_replace(coalesce(case when v_loc = 'en' then coalesce(nullif(p_new->>'title_en', ''), nullif(p_new->>'title_de', ''))
                                                  else coalesce(nullif(p_new->>'title_de', ''), nullif(p_new->>'title_en', '')) end, ''), '\s+', ' ', 'g'),
    'event_name', coalesce(p_event, ''),
    'changes', v_lines,
    'alt_title_de', v_alt->'title_de', 'alt_title_en', v_alt->'title_en',
    'alt_start_at', v_alt->'start_at', 'alt_end_at', v_alt->'end_at',
    'alt_stage_id', v_alt->'stage_id', 'alt_stage_name', v_alt->'stage_name');
  if p_org_id is not null then
    select coalesce(o.communication_name, o.legal_name) into v_org from organization o where o.id = p_org_id;
    v_vars := v_vars || jsonb_build_object('org_name', coalesce(v_org, ''));
  end if;
  if p_profile is not null then
    v_mail := queue_speaker_mail_debounced(p_key, p_profile, v_vars, 'session', p_session_id, interval '15 minutes', 'alt_');
  else
    v_mail := queue_mail_debounced(p_key, p_target, v_vars, 'session', p_session_id, interval '15 minutes', 'alt_');
  end if;
  if v_mail is not null and p_org_id is not null then
    -- CC-Kontakte der Organisation in Kopie, genau an der Mail an den Hauptkontakt (PART-063).
    perform partner_mail_cc(v_mail, p_org_id);
  end if;
  if v_mail is not null and not v_had then
    perform log_audit('mail.session_change', 'session', p_session_id::text, null,
      jsonb_build_object('person_id', p_target, 'template', p_key, 'state', 'queued', 'mail_id', v_mail));
  end if;
  return v_mail;
end $$;

-- Die Änderung einer veröffentlichten Session an alle Beteiligten melden. `p_old` und `p_new` sind Stände aus `session_change_state`
-- (Titel, Zeit, Bühne vor und nach der Änderung).
create or replace function session_change_notify(p_session_id uuid, p_old jsonb, p_new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_s session%rowtype; v_tz text; v_event text; v_ed uuid; v_primary uuid; r record; v_n integer;
  v_speakers uuid[] := '{}'; v_partners uuid[] := '{}';
begin
  -- Nur, wenn eine Person handelt: Skripte, Migrationen und die Service-Rolle schicken keine Mail.
  if current_person_id() is null then return; end if;
  select * into v_s from session where id = p_session_id;
  if not found or v_s.publish_status is distinct from 'published' then return; end if;
  -- Das Profil hängt an der Edition (`speaker_profile.edition_id`), die Session am Event des Summits, der auf die Edition verweist.
  select coalesce(e.timezone, 'Europe/Berlin'), coalesce(e.name, ''), coalesce(e.edition_id, e.id) into v_tz, v_event, v_ed from event e where e.id = v_s.event_id;
  v_tz := coalesce(v_tz, 'Europe/Berlin');
  v_event := coalesce(v_event, '');

  -- Speaker, Moderation, Host und Panel: mit Profil über die Weiche (Kontakt statt Speaker, wenn eingerichtet), ohne Profil direkt.
  for r in
    select distinct on (z.empfaenger) z.empfaenger, z.profile_id
      from (select case when prof.id is not null then speaker_mail_recipient(prof.id) else ss.person_id end as empfaenger, prof.id as profile_id
              from session_speaker ss
              left join speaker_profile prof on prof.person_id = ss.person_id and prof.edition_id = v_ed
             where ss.session_id = p_session_id) z
     where z.empfaenger is not null
     order by z.empfaenger, z.profile_id nulls last
  loop
    v_speakers := v_speakers || r.empfaenger;
    perform session_change_queue('session_changed', r.empfaenger, r.profile_id, null, p_session_id, p_old, p_new, v_tz, v_event);
  end loop;

  -- Partner-Session: der Hauptkontakt der Organisation, mit den CC-Kontakten in Kopie.
  if v_s.partner_org_id is not null then
    select om.person_id into v_primary from org_membership om
     where om.org_id = v_s.partner_org_id and om.roles @> '{primary_ops}' order by om.person_id limit 1;
    if v_primary is not null then
      v_partners := v_partners || v_primary;
      perform session_change_queue('session_changed_partner', v_primary, null, v_s.partner_org_id, p_session_id, p_old, p_new, v_tz, v_event);
    end if;
  end if;

  -- Wer inzwischen nicht mehr zur Session gehört, bekommt die wartende Mail nicht mehr.
  for r in
    select distinct m.template_key, m.person_id from mail_log m
     where m.status = 'queued' and m.related_id = p_session_id and m.template_key in ('session_changed', 'session_changed_partner')
       and not (m.person_id = any (case when m.template_key = 'session_changed' then v_speakers else v_partners end))
  loop
    v_n := cancel_queued_mail(r.template_key, p_session_id, r.person_id, 'no_longer_recipient');
    if v_n > 0 then
      perform log_audit('mail.session_change', 'session', p_session_id::text, null,
        jsonb_build_object('person_id', r.person_id, 'template', r.template_key, 'state', 'cancelled', 'reason', 'no_longer_recipient'));
    end if;
  end loop;
end $$;
comment on function session_change_notify(uuid, jsonb, jsonb) is
  'Änderung einer veröffentlichten Session (Titel, Zeit, Bühne) an Speaker, Moderation und ggf. den Partner-Hauptkontakt melden (LEAD-063): wartende Mail mit send_after = erste Änderung + 15 Minuten, Folgeänderungen aktualisieren sie, der Rückweg zum alten Stand storniert sie. Nur, wenn eine Person handelt. Aufgerufen von den Triggern auf slot und session; intern.';

-- Trigger auf slot: Zeit oder Bühne eines Slots mit veröffentlichter Session hat sich geändert.
create or replace function slot_session_change_mail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record;
begin
  if (new.start_at, new.end_at, new.stage_id) is not distinct from (old.start_at, old.end_at, old.stage_id) then
    return coalesce(new, old);
  end if;
  for r in select s.id, s.title_de, s.title_en from session s where s.slot_id = new.id and s.publish_status = 'published' loop
    begin
      perform session_change_notify(r.id,
        jsonb_build_object('title_de', r.title_de, 'title_en', r.title_en, 'start_at', old.start_at, 'end_at', old.end_at,
                           'stage_id', old.stage_id, 'stage_name', (select st.name from stage st where st.id = old.stage_id)),
        jsonb_build_object('title_de', r.title_de, 'title_en', r.title_en, 'start_at', new.start_at, 'end_at', new.end_at,
                           'stage_id', new.stage_id, 'stage_name', (select st.name from stage st where st.id = new.stage_id)));
    exception when others then
      -- Der Mailweg darf eine Programmänderung nie verhindern.
      raise warning 'slot_session_change_mail: % (%)', sqlerrm, sqlstate;
    end;
  end loop;
  return coalesce(new, old);
end $$;

-- Trigger auf session: Titel oder Slot einer veröffentlichten Session hat sich geändert (Veröffentlichung selbst ist keine Änderung).
create or replace function session_change_mail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if old.publish_status is distinct from 'published' or new.publish_status is distinct from 'published' then
    return coalesce(new, old);
  end if;
  if (new.title_de, new.title_en, new.slot_id) is not distinct from (old.title_de, old.title_en, old.slot_id) then
    return coalesce(new, old);
  end if;
  begin
    perform session_change_notify(new.id,
      session_change_state(old.title_de, old.title_en, old.slot_id),
      session_change_state(new.title_de, new.title_en, new.slot_id));
  exception when others then
    raise warning 'session_change_mail: % (%)', sqlerrm, sqlstate;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_slot_session_change_mail on slot;
create trigger trg_slot_session_change_mail after update of start_at, end_at, stage_id on slot
  for each row execute function slot_session_change_mail();
drop trigger if exists trg_session_change_mail on session;
create trigger trg_session_change_mail after update of title_de, title_en, slot_id on session
  for each row execute function session_change_mail();

-- === 4 · Vorlagen (DE/EN) =======================================================================================================
-- Variablen: `session_title`, `event_name`, `changes` (Liste der geänderten Felder, in der Sprache der Mail), beim Partner zusätzlich `org_name`.
-- Der Link entsteht aus `{{portal_url}}`; die Sprache bestimmt `queue_mail`.
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('session_changed', 'de', 1, 'Änderung im Programm: {{session_title}}',
   E'Hallo {{first_name}},\n\ndein Programmpunkt **{{session_title}}** ({{event_name}}) hat sich geändert:\n\n{{changes}}\n\nDen aktuellen Stand findest du jederzeit im [Speaker-Portal]({{portal_url}}/speaker). Passt dir der neue Termin nicht, melde dich bitte direkt bei deiner Ansprechperson im Team.\n\nViele Grüße\nChefTreff',
   'Änderung an Zeit, Bühne oder Titel einer veröffentlichten Session (an Speaker und Moderation, gebündelt, etwa 15 Minuten nach der ersten Änderung)', true),
  ('session_changed', 'en', 1, 'Programme update: {{session_title}}',
   E'Hi {{first_name}},\n\nyour session **{{session_title}}** ({{event_name}}) has changed:\n\n{{changes}}\n\nYou can always find the current schedule in the [speaker portal]({{portal_url}}/speaker). If the new slot does not work for you, please contact your contact person on the team directly.\n\nBest,\nChefTreff',
   'Change to time, stage or title of a published session (to speakers and moderators, combined, about 15 minutes after the first change)', true),
  ('session_changed_partner', 'de', 1, 'Änderung im Programm: {{session_title}} – {{org_name}}',
   E'Hallo {{first_name}},\n\nder Programmpunkt **{{session_title}}** von {{org_name}} ({{event_name}}) hat sich geändert:\n\n{{changes}}\n\nDen aktuellen Stand findest du jederzeit im [Partner-Portal]({{portal_url}}/partner). Passt der neue Termin nicht, melde dich bitte bei deiner Ansprechperson im Team.\n\nViele Grüße\nChefTreff',
   'Änderung an Zeit, Bühne oder Titel einer veröffentlichten Partner-Session (an den Hauptkontakt, CC-Kontakte in Kopie, gebündelt)', true),
  ('session_changed_partner', 'en', 1, 'Programme update: {{session_title}} – {{org_name}}',
   E'Hi {{first_name}},\n\nthe session **{{session_title}}** by {{org_name}} ({{event_name}}) has changed:\n\n{{changes}}\n\nYou can always find the current schedule in the [partner portal]({{portal_url}}/partner). If the new slot does not work, please contact your contact person on the team.\n\nBest,\nChefTreff',
   'Change to time, stage or title of a published partner session (to the primary contact, CC contacts in copy, combined)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- === 5 · Rechte ================================================================================================================
-- Alles intern: nur Definer-Aufrufer und die Service-Rolle (Hilfsfunktionen für den Partner-Chat) rufen es auf.
revoke execute on function mail_locale_for(uuid) from public, anon, authenticated;
revoke execute on function queue_mail_debounced(text, uuid, jsonb, text, uuid, interval, text) from public, anon, authenticated;
revoke execute on function queue_speaker_mail_debounced(text, uuid, jsonb, text, uuid, interval, text) from public, anon, authenticated;
revoke execute on function cancel_queued_mail(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function session_change_state(text, text, uuid) from public, anon, authenticated;
revoke execute on function session_change_lines(jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function session_change_queue(text, uuid, uuid, uuid, uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function session_change_notify(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function slot_session_change_mail() from public, anon, authenticated;
revoke execute on function session_change_mail() from public, anon, authenticated;

select harden_definer_functions();
