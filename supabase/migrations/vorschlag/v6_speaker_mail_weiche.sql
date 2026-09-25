-- 00NN · PART-091: Speaker-Mails an den zugeordneten Kontakt, wenn der Partner alles verwaltet
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- **Braucht `v6_talk_speaker_zugang` (Partner-Chat) davor:** dort entsteht
-- `speaker_profile.mail_via_contact_id` (zusammengesetzter Fremdschlüssel auf
-- `speaker_contact (id, profile_id)`, `on delete set null`) samt Schreibweg
-- `partner_add_speaker(…, p_verwaltet)`. Dieser Vorschlag legt das Feld nicht
-- an, er liest es nur.
--
-- Anlass: PART-091 (Konrad 25.09., Entscheidungslog): Speaker eines gebuchten
-- Partner-Slots haben entweder einen eigenen Zugang, oder „der Partner verwaltet
-- alles“ — dann läuft die gesamte Kommunikation über den zugeordneten Kontakt,
-- und die Speakerin wird intern informiert. Heute gehen alle Speaker-Mails über
-- `queue_mail(…, ss.person_id, …)` direkt an die Speakerin.
--
-- Neu:
--   * `speaker_mail_recipient(profile)`: der Kontakt aus `mail_via_contact_id`,
--     wenn er zum Profil gehört, Zugang hat, nicht gelöscht ist und eine
--     primäre Adresse hat — sonst die Speakerin (Rückfall, damit nichts ins
--     Leere geht).
--   * `queue_speaker_mail(template, profile, vars, related_type, related_id)`:
--     `queue_mail` mit diesem Empfänger; bei Umleitung trägt `vars.on_behalf_of`
--     den Namen der Speakerin. Der Versand (`lib/mail/queue.ts`) stellt dann die
--     Zeile „Diese Mail betrifft …“ voran — keine zweite Fassung je Vorlage.
--     Beide Funktionen sind intern: EXECUTE nur für die Definer-Funktionen.
--   * Umgestellt: `confirm_hospitality`, `confirm_companion_ticket`,
--     `decline_companion_ticket`, `approve_expense`, `reject_expense`,
--     `ticket_final_mail` (also auch der Weg über `set_ticket_issued`, der
--     selbst unverändert bleibt). Beträge und Bezeichnungen in der Sprache des
--     Empfängers, nicht der Speakerin — sonst passte der Text nicht zur Mail.
--   * Die zwei Session-Mails (`send_presentation_reminders`, „Bühnenfotos
--     bereit“ in `register_session_asset`) gehen je Empfänger und Session
--     **einmal** und nennen alle umgeleiteten Speaker: verwaltet ein Kontakt ein
--     Panel des Partners, ließe `queue_mail` die zweite Mail sonst als Doppel
--     fallen (gleicher Empfänger, gleiche Vorlage, gleicher Bezug).
--   * `invite_speaker`: bei gesetzter Regel P0001 `speaker_managed_by_partner`
--     — die Einladung ist persönlich und wird nie umgeleitet; den Zugang hat der
--     Kontakt über seine eigene Einladung (Partner-Chat).
--   * `speaker_detail` gibt `mail_via` aus (Name, Zugang) — das Admin-Detail
--     zeigt, über wen die Mails gehen, und bietet keine Einladung an.
--
-- Nicht umgestellt: `submit_expense` (geht ans Team), `invite_assistant` und
-- `upsert_speaker_contact` (gehen an den Kontakt selbst), Löschanfragen
-- (persönlich).
--
-- Funktionen aus `supabase/snapshot/functions/`: `confirm_hospitality`,
-- `confirm_companion_ticket`, `decline_companion_ticket`, `approve_expense`,
-- `reject_expense`, `ticket_final_mail`, `send_presentation_reminders`,
-- `register_session_asset`, `invite_speaker`, `speaker_detail`.
-- Neuer Fehlerschlüssel: `speaker_managed_by_partner` (P0001).

set search_path = public, extensions;

-- ---- 1 · Empfänger und Weiche (intern)
create or replace function speaker_mail_recipient(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
           (select c.person_id
              from speaker_contact c
              join person p on p.id = c.person_id and p.deleted_at is null
              join person_email pe on pe.person_id = p.id and pe.is_primary
             where c.id = sp.mail_via_contact_id and c.profile_id = sp.id and c.has_access
             limit 1),
           sp.person_id)
    from speaker_profile sp
   where sp.id = p_profile_id
$$;
revoke execute on function speaker_mail_recipient(uuid) from public, anon, authenticated;

create or replace function queue_speaker_mail(p_template_key text, p_profile_id uuid, p_vars jsonb DEFAULT '{}'::jsonb, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid)
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
    return queue_mail(p_template_key, v_an,
                      coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('on_behalf_of', coalesce(v_name, '')),
                      p_related_type, p_related_id);
  end if;
  return queue_mail(p_template_key, v_person, p_vars, p_related_type, p_related_id);
end $$;
revoke execute on function queue_speaker_mail(text, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- Sprache des Empfängers für Beträge und Bezeichnungen — dieselbe Regel wie in
-- den bisherigen Aufrufstellen (`preferred_language`, sonst Englisch).
create or replace function speaker_mail_locale(p_profile_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end, 'en')
    from person p where p.id = speaker_mail_recipient(p_profile_id)
$$;
revoke execute on function speaker_mail_locale(uuid) from public, anon, authenticated;

-- ---- 2 · Einzelne Mails über die Weiche
create or replace function confirm_hospitality(p_booking_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b hospitality_booking%rowtype; v_q hospitality_quota%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_b from hospitality_booking where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  if v_b.status = 'cancelled' then raise exception 'booking_cancelled' using errcode = 'P0001'; end if;
  select * into v_q from hospitality_quota where id = v_b.quota_id;
  select * into v_sp from speaker_profile where id = v_b.profile_id;
  update hospitality_booking set status = 'confirmed', confirmed_by = current_person_id(), confirmed_at = now(), team_note = coalesce(nullif(btrim(p_note), ''), team_note)
   where id = p_booking_id;
  update speaker_profile set hospitality_status = 'booked' where id = v_sp.id and hospitality_status in ('eligible', 'requested');
  -- PART-091: an den Empfänger der Speaker-Mails, in dessen Sprache.
  v_locale := speaker_mail_locale(v_sp.id);
  perform queue_speaker_mail('hospitality_confirmed', v_sp.id,
    jsonb_build_object(
      'kind', v_q.kind,
      'quota_label', case when v_locale = 'de' then v_q.label_de else v_q.label_en end,
      'location', coalesce(v_q.location, ''),
      'window', coalesce(mail_fmt_ts(v_q.window_from, 'Europe/Berlin', v_locale), '') || case when v_q.window_to is not null then ' – ' || mail_fmt_ts(v_q.window_to, 'Europe/Berlin', v_locale) else '' end,
      'guests', v_b.guests,
      'details', (select string_agg(key || ': ' || value, ', ') from jsonb_each_text(v_b.details)),
      'team_note', coalesce(p_note, '')),
    'hospitality_booking', v_b.id);
  perform log_audit('hospitality.confirm', 'hospitality_booking', p_booking_id::text, jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed', 'note', p_note));
end $$;

create or replace function confirm_companion_ticket(p_ticket_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'approved', approved_by = current_person_id(), approved_at = now(), team_note = nullif(btrim(p_note), '')
   where id = p_ticket_id;
  -- PART-091: an den Empfänger der Speaker-Mails.
  perform queue_speaker_mail('companion_ticket_confirmed', v_sp.id,
                     jsonb_build_object('companion_name', btrim(coalesce(v_t.holder_first_name, '') || ' ' || coalesce(v_t.holder_last_name, '')),
                                        'companion_email', v_t.holder_email::text, 'note', coalesce(nullif(btrim(p_note), ''), '')),
                     'ticket', p_ticket_id);
  perform log_audit('ticket.companion_approved', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'approved', 'note', p_note));
end $$;

create or replace function decline_companion_ticket(p_ticket_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.status not in ('requested', 'approved') then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'cancelled', team_note = btrim(p_note), approved_by = null, approved_at = null where id = p_ticket_id;
  -- PART-091: an den Empfänger der Speaker-Mails.
  perform queue_speaker_mail('companion_ticket_declined', v_sp.id,
                     jsonb_build_object('companion_name', btrim(coalesce(v_t.holder_first_name, '') || ' ' || coalesce(v_t.holder_last_name, '')),
                                        'note', btrim(p_note)),
                     'ticket', p_ticket_id);
  perform log_audit('ticket.companion_declined', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'cancelled', 'note', p_note));
end $$;

create or replace function approve_expense(p_claim_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_c.status; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  update expense_claim set status = 'approved', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_note), '') where id = p_claim_id;
  -- PART-091: an den Empfänger der Speaker-Mails, Betrag in dessen Sprache.
  v_locale := speaker_mail_locale(v_sp.id);
  perform queue_speaker_mail('expense_approved', v_sp.id, jsonb_build_object('amount', fmt_cents(v_c.amount_cents, v_locale), 'invoice_no', v_c.invoice_no, 'note', coalesce(p_note, '')), 'expense_claim', p_claim_id);
  perform log_audit('expense.approve', 'expense_claim', p_claim_id::text, jsonb_build_object('status', v_c.status), jsonb_build_object('status', 'approved', 'note', p_note));
end $$;

create or replace function reject_expense(p_claim_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c expense_claim%rowtype; v_sp speaker_profile%rowtype; v_locale text;
begin
  if not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_c from expense_claim where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_c.status; end if;
  select * into v_sp from speaker_profile where id = v_c.profile_id;
  update expense_claim set status = 'rejected', reviewed_by = current_person_id(), reviewed_at = now(), review_note = btrim(p_note) where id = p_claim_id;
  -- PART-091: an den Empfänger der Speaker-Mails, Betrag in dessen Sprache.
  v_locale := speaker_mail_locale(v_sp.id);
  perform queue_speaker_mail('expense_rejected', v_sp.id, jsonb_build_object('amount', fmt_cents(v_c.amount_cents, v_locale), 'invoice_no', v_c.invoice_no, 'note', btrim(p_note)), 'expense_claim', p_claim_id);
  perform log_audit('expense.reject', 'expense_claim', p_claim_id::text, jsonb_build_object('status', v_c.status), jsonb_build_object('status', 'rejected', 'note', p_note));
end $$;

create or replace function ticket_final_mail(p_t ticket)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_person uuid; v_halter text;
begin
  -- Empfaenger: die Speakerin. Beim Begleitticket gibt es keine Person zur
  -- Inhaberin (siehe Kopf), und `queue_mail` braucht eine.
  select sp.person_id into v_person from speaker_profile sp where sp.id = p_t.speaker_profile_id;
  if v_person is null then return; end if;
  -- Nur einmal je Ticket, unabhaengig vom Status der ersten Mail.
  if exists (select 1 from mail_log m
              where m.template_key = 'ticket_final' and m.related_type = 'ticket' and m.related_id = p_t.id) then
    return;
  end if;
  v_halter := nullif(btrim(coalesce(p_t.holder_first_name, '') || ' ' || coalesce(p_t.holder_last_name, '')), '');
  -- PART-091: an den Empfänger der Speaker-Mails.
  perform queue_speaker_mail('ticket_final', p_t.speaker_profile_id,
                     jsonb_build_object('holder_name', coalesce(v_halter, p_t.holder_email::text, '—'),
                                        'source', p_t.source),
                     'ticket', p_t.id);
end $$;

-- ---- 3 · Session-Mails je Empfänger
create or replace function send_presentation_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- PART-091: je Empfänger und Session eine Mail. Verwaltet ein Kontakt
  -- mehrere Speaker derselben Session (ein Panel des Partners), nennt die eine
  -- Mail sie alle — `queue_mail` ließe eine zweite sonst als Doppel fallen.
  for r in
    select x.recipient, x.session_id, x.timezone, x.effective_due, x.start_at,
           coalesce(case when rp.preferred_language in ('de', 'en') then rp.preferred_language end, 'en') as locale,
           string_agg(distinct x.fuer, ', ' order by x.fuer) as fuer
    from (
    select speaker_mail_recipient(sp.id) as recipient, se.id as session_id, e.timezone,
           least(d.due_at, sl.start_at - interval '48 hours') as effective_due, sl.start_at,
           case when speaker_mail_recipient(sp.id) is distinct from ss.person_id
                then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end as fuer
    from session se
    join slot sl on sl.id = se.slot_id
    join event e on e.id = se.event_id
    join session_speaker ss on ss.session_id = se.id
    join person p on p.id = ss.person_id
    join speaker_profile sp on sp.person_id = ss.person_id and sp.edition_id = coalesce(e.edition_id, e.id)
    left join deadline d on d.key = 'presentation_upload' and d.edition_id = coalesce(e.edition_id, e.id)
    where se.publish_status <> 'cancelled'
      and sl.start_at > now()
      and speaker_is_confirmed(sp.pipeline_status)
      -- SPK-070: Gäste laden keine Präsentation im Portal hoch, sie haben keins.
      and not sp.stage_guest
      and now() >= least(d.due_at, sl.start_at - interval '48 hours') - make_interval(hours => coalesce(d.reminder_lead_hours, 48))
      and not exists (select 1 from speaker_asset a
                      where a.profile_id = sp.id and a.kind = 'presentation' and a.is_current
                        and (a.session_id = se.id or a.session_id is null))
      and not exists (select 1 from mail_log m
                      where m.template_key = 'presentation_reminder' and m.person_id = speaker_mail_recipient(sp.id)
                        and m.related_type = 'session' and m.related_id = se.id)
    ) x
    join person rp on rp.id = x.recipient
    group by x.recipient, x.session_id, x.timezone, x.effective_due, x.start_at, rp.preferred_language
    order by x.start_at
  loop
    perform queue_mail('presentation_reminder', r.recipient,
                       session_mail_vars(r.session_id, r.locale) || jsonb_build_object('due_label', mail_fmt_ts(r.effective_due, r.timezone, r.locale))
                         || case when r.fuer is not null then jsonb_build_object('on_behalf_of', r.fuer) else '{}'::jsonb end,
                       'session', r.session_id);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('presentation.reminder', 'system', 'cron', jsonb_build_object('sent', v_n));
  end if;
  return v_n;
end $$;

create or replace function register_session_asset(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_session uuid := nullif(p_data->>'session_id', '')::uuid;
        v_kind text := nullif(p_data->>'kind', '');
        v_path text := nullif(btrim(p_data->>'storage_path'), '');
        v_id uuid; v_version integer; v_erstes boolean; r record;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_kind not in ('stage_photo', 'slot_graphic') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(v_kind, 'null');
  end if;
  if not exists (select 1 from session se where se.id = v_session) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_path is null or split_part(v_path, '/', 1) <> v_session::text
     or split_part(v_path, '/', 2) <> v_kind then
    raise exception 'invalid_path' using errcode = '22023', detail = coalesce(v_path, 'null');
  end if;

  v_erstes := not exists (select 1 from session_asset a
                           where a.session_id = v_session and a.kind = 'stage_photo');
  select coalesce(max(a.version), 0) + 1 into v_version
    from session_asset a where a.session_id = v_session and a.kind = v_kind;

  if v_kind = 'slot_graphic' then
    update session_asset set is_current = false
     where session_id = v_session and kind = 'slot_graphic' and is_current;
  end if;

  insert into session_asset (session_id, kind, storage_path, filename, mime, size_bytes,
                             width, height, cutout, credit, version, uploaded_by)
  values (v_session, v_kind, v_path, coalesce(nullif(btrim(p_data->>'filename'), ''), 'datei'),
          nullif(p_data->>'mime', ''), (p_data->>'size_bytes')::bigint,
          (p_data->>'width')::integer, (p_data->>'height')::integer,
          coalesce((p_data->>'cutout')::boolean, false),
          nullif(btrim(p_data->>'credit'), ''), v_version, current_person_id())
  returning id into v_id;

  if v_kind = 'stage_photo' and v_erstes then
    -- PART-091: je Empfänger eine Mail — ein Kontakt, der mehrere Speaker der
    -- Session verwaltet, bekommt eine, die sie alle nennt.
    for r in
      select speaker_mail_recipient(sp.id) as recipient, coalesce(se.title_de, se.title_en) as titel,
             string_agg(distinct case when speaker_mail_recipient(sp.id) is distinct from ss.person_id
                                      then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end,
                        ', ') as fuer
        from session_speaker ss join session se on se.id = ss.session_id
        join event ev on ev.id = se.event_id
        -- SPK-070 / LEAD-042: die Mail führt ins Speaker-Portal. Sie geht deshalb
        -- nur an Speaker mit Profil dieser Edition — nicht an Gäste des Partners
        -- und nicht an eine Moderation ohne Profil (etwa einen Stage Lead).
        join speaker_profile sp on sp.person_id = ss.person_id
                               and sp.edition_id = coalesce(ev.edition_id, ev.id)
                               and not sp.stage_guest
        join person p on p.id = ss.person_id
       where ss.session_id = v_session
       group by 1, 2
    loop
      perform queue_mail('stage_photos_ready', r.recipient,
                         jsonb_build_object('session_title', coalesce(r.titel, ''))
                           || case when r.fuer is not null then jsonb_build_object('on_behalf_of', r.fuer) else '{}'::jsonb end,
                         'session', v_session);
    end loop;
  end if;

  perform log_audit('session_asset.register', 'session_asset', v_id::text, null,
                    jsonb_build_object('session_id', v_session, 'kind', v_kind, 'version', v_version));
  return v_id;
end $$;

-- ---- 4 · Einladung bleibt persönlich
create or replace function invite_speaker(p_profile_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_mail bigint; v_actor uuid := current_person_id();
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- PART-081: Gäste der Standbühne bekommen keinen Speaker-Zugang.
  if v_sp.stage_guest then raise exception 'stage_guest' using errcode = 'P0001'; end if;
  -- PART-091: verwaltet der Partner alles, läuft die Kommunikation über den
  -- zugeordneten Kontakt. Die Einladung ist persönlich und wird nie umgeleitet;
  -- den Zugang hat der Kontakt über seine eigene Einladung.
  if v_sp.mail_via_contact_id is not null then
    raise exception 'speaker_managed_by_partner' using errcode = 'P0001';
  end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sp.pipeline_status not in ('confirmed', 'onboarded', 'ready', 'published') then
    raise exception 'not_confirmed' using errcode = 'P0001', detail = v_sp.pipeline_status;
  end if;
  insert into role_assignment (person_id, role, scope_type, edition_id, granted_by, note)
  values (v_sp.person_id, 'speaker', 'edition', v_sp.edition_id, v_actor, 'speaker_profile')
  on conflict (person_id, role, scope_type,
               coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(portal, ''))
  do update set valid_to = null;
  v_mail := queue_mail('speaker_invite', v_sp.person_id,
    jsonb_build_object('edition_name', (select e.name from event e where e.id = v_sp.edition_id),
                       'inviter_name', coalesce((select p.first_name from person p where p.id = v_actor), 'ChefTreff')),
    'speaker_profile', v_sp.id);
  update speaker_profile set invited_at = now() where id = p_profile_id;
  perform log_audit('speaker.invite', 'speaker_profile', p_profile_id::text, null, jsonb_build_object('mail_log_id', v_mail));
  return v_mail;
end $$;

-- ---- 5 · Admin-Detail: über wen die Mails gehen
create or replace function speaker_detail(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_p person%rowtype; v_team boolean;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from person where id = v_sp.person_id;
  v_team := is_speaker_team(v_sp.edition_id);

  return jsonb_build_object(
    -- Der Kontakt ohne Portalzugang (0127) ist genau fuer das Team da: es
    -- soll wissen, wen es statt der Speakerin anschreibt.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id,
    'edition_id', v_sp.edition_id,
    'person', jsonb_build_object(
      'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
      'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary),
      'preferred_language', v_p.preferred_language,
      'salutation_de', v_p.salutation_de, 'salutation_en', v_p.salutation_en,
      'has_account', v_p.auth_user_id is not null),
    'speaker_type', v_sp.speaker_type,
    'pipeline_status', v_sp.pipeline_status,
    'confirmed_at', v_sp.confirmed_at,
    'declined_at', v_sp.declined_at,
    'decline_reason', v_sp.decline_reason,
    'invited_at', v_sp.invited_at,
    'owner_person_id', v_sp.owner_person_id,
    'owner_name', (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
                     from person o where o.id = v_sp.owner_person_id),
    'assistant_person_id', v_sp.assistant_person_id,
    'assistant_name', (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
                         from person a where a.id = v_sp.assistant_person_id),
    'job_title', v_sp.job_title,
    'organization_name', v_sp.organization_name,
    'org_id', v_sp.org_id,
    'org_name', (select coalesce(og.communication_name, og.legal_name) from organization og where og.id = v_sp.org_id),
    'bio_short_de', v_sp.bio_short_de, 'bio_short_en', v_sp.bio_short_en,
    'bio_long_de', v_sp.bio_long_de, 'bio_long_en', v_sp.bio_long_en,
    'socials', v_sp.socials,
    'tech_rider', v_sp.tech_rider,
    'photo_asset_id', v_sp.photo_asset_id,
    'reception_eligible', v_sp.reception_eligible,
    'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type,
    'hotel_tier', v_sp.hotel_tier,
    'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered,
    'expense_mode', v_sp.expense_mode,
    'expense_lump_sum_cents', v_sp.expense_lump_sum_cents,
    'travel_costs_approved_at', v_sp.travel_costs_approved_at,
    'travel_costs_approved_by', (select nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), '')
                                   from person b where b.id = v_sp.travel_costs_approved_by),
    'lead_contact_id', v_sp.lead_contact_id,
    'buddy_contact_id', v_sp.buddy_contact_id,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'display_name', c.display_name)
                                           order by c.type), '[]'::jsonb)
                   from edition_contact c
                  where c.id in (v_sp.lead_contact_id, v_sp.buddy_contact_id)),
    'travel', (select to_jsonb(tr) - 'updated_by' from speaker_travel tr where tr.profile_id = v_sp.id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
                                   'session_id', se.id, 'title_de', se.title_de, 'title_en', se.title_en,
                                   'publish_status', se.publish_status, 'start_at', sl.start_at, 'stage_name', st.name)
                                 order by sl.start_at nulls last)
                          from session_speaker ss
                          join session se on se.id = ss.session_id
                          join event e on e.id = se.event_id
                          left join slot sl on sl.id = se.slot_id
                          left join stage st on st.id = sl.stage_id
                          where ss.person_id = v_sp.person_id
                            and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)), '[]'::jsonb),
    'speaker_contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                                   'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                                   'has_access', c.has_access, 'consent_at', c.consent_at)
                                 order by c.kind, c.created_at), '[]'::jsonb)
                           from speaker_contact c where c.profile_id = v_sp.id),
    'internal_notes_visible', v_team,
    'created_at', v_sp.created_at,
    'updated_at', v_sp.updated_at
  )
  -- LEAD-039: als zweites Objekt — das erste hat 44 Paare, und
  -- `jsonb_build_object` nimmt höchstens 100 Argumente.
  || jsonb_build_object(
    'category', v_sp.category,
    'topic_cluster', v_sp.topic_cluster,
    'topic_role', v_sp.topic_role,
    'priority', v_sp.priority,
    'recommended_format', v_sp.recommended_format,
    'contact_via', v_sp.contact_via,
    'outreach_channel', v_sp.outreach_channel,
    -- SPK-070: Gast des Partners (0188) — das Detail bietet dann keine Einladung an.
    'stage_guest', v_sp.stage_guest,
    -- PART-091: über wen die Speaker-Mails gehen, wenn der Partner alles verwaltet.
    'mail_via', (select jsonb_build_object(
                          'contact_id', c.id,
                          'name', coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
                                           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                              from person p where p.id = c.person_id)),
                          'has_access', c.has_access)
                   from speaker_contact c where c.id = v_sp.mail_via_contact_id),
    'stage_candidates', coalesce((select jsonb_agg(jsonb_build_object('stage_id', st.id, 'name', st.name)
                                                   order by st.sort_order, st.name)
                                    from speaker_stage_candidate c join stage st on st.id = c.stage_id
                                   where c.profile_id = v_sp.id), '[]'::jsonb))
  || case when v_team then jsonb_build_object('internal_notes', v_sp.internal_notes) else '{}'::jsonb end;
end $$;

select harden_definer_functions();
