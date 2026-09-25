-- 0192 · Ticket-Mail ticket_final beim Ausstellen (SPK-068 Teil 2)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925093316.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Mit #183 kann das Team Speaker- und Begleittickets ausstellen; erfahren hat es bisher
-- niemand. `docs/mail-plan.md` sieht dafuer die Vorlage `ticket_final` vor (Welle 1, A2) — die gab
-- es noch nicht. Diese Migration legt sie an (DE und EN) und haengt den Versand an den einen Weg,
-- ueber den ein Freiticket gueltig wird: `set_ticket_issued`.
--
-- **Auch im Wettlauf-Fall.** War der Webhook `ticket.created` schneller, kehrt `set_ticket_issued`
-- still zurueck (SPK-068). Ohne Mail an dieser Stelle bekaeme ausgerechnet die Person keine Post,
-- bei der die Laufzeit anders fiel — ein Zufall entschiede darueber, wer sein Ticket bemerkt.
--
-- **Empfaenger ist die Speakerin, auch beim Begleitticket.** Das ist eine Entscheidung, keine
-- Bequemlichkeit: ein Begleitticket traegt nur `holder_email`, es gibt **keine** Person und damit
-- kein Profil, keine Sprache, keine Unterdrueckungsliste und keine Einwilligung. An eine solche
-- Adresse zu schreiben waere eine neue Empfaengergruppe — das entscheidet Konrad, nicht eine
-- Migration. Die Speakerin hat das Ticket angefragt, sieht beide unter `/speaker/tickets` und gibt
-- es weiter. Die Vorlage nennt deshalb die Inhaberin beim Namen (`holder_name`) und funktioniert
-- fuer beide Faelle, ohne im Text zu unterscheiden.
--
-- **Genau einmal.** `queue_mail` schuetzt nur gegen eine zweite *wartende* Mail zur selben
-- Ticketkennung; ist die erste schon verschickt, legte ein zweiter Klick eine zweite an.
-- `ticket_final_mail` prueft deshalb auf **jeden** Eintrag in `mail_log` zu diesem Ticket,
-- unabhaengig vom Status.
--
-- Rechte: `ticket_final_mail` ist ein interner Helfer — SECURITY DEFINER mit gepinntem
-- `search_path`, und `harden_definer_functions()` entzieht `anon` das Ausfuehren. Aufgerufen wird
-- er nur aus `set_ticket_issued`, das selbst schon geprueft hat.
-- Basis: `supabase/snapshot/functions/set_ticket_issued.sql` (Konvention §1).
-- Test: `supabase/tests/v6_ticket_final_mail.sql`.

-- 1 · Die Vorlage
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active
from (values
  ('ticket_final', 'de', 1, 'Ticket ausgestellt: {{holder_name}}',
   E'Hallo {{first_name}},\n\ndas Ticket für **{{holder_name}}** zum Future Leader Summit ist ausgestellt.\n\n[Ticket ansehen]({{portal_url}}/speaker/tickets)\n\nDort findest du den QR-Code für den Einlass und den Knopf, um das Ticket in die Wallet auf dem Handy zu legen. Zum Einlass brauchst du nur den Code — ausgedruckt oder auf dem Bildschirm.\n\nViele Grüße\nChefTreff',
   'Freiticket ausgestellt (Speaker-Pass oder Begleitticket), SPK-068', true),
  ('ticket_final', 'en', 1, 'Ticket issued: {{holder_name}}',
   E'Hi {{first_name}},\n\nthe ticket for **{{holder_name}}** for the Future Leader Summit has been issued.\n\n[View ticket]({{portal_url}}/speaker/tickets)\n\nYou will find the QR code for entry there, and the button to add the ticket to the wallet on your phone. All you need at the door is the code — printed or on screen.\n\nBest\nChefTreff',
   'Free ticket issued (speaker pass or companion ticket), SPK-068', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- 2 · Der Versand, an einer Stelle fuer beide Wege
create or replace function ticket_final_mail(p_t ticket)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
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
  perform queue_mail('ticket_final', v_person,
                     jsonb_build_object('holder_name', coalesce(v_halter, p_t.holder_email::text, '—'),
                                        'source', p_t.source),
                     'ticket', p_t.id);
end $$;

-- 3 · Ausstellen verschickt
create or replace function set_ticket_issued(p_ticket_id uuid, p_vivenu_ticket_id text, p_barcode text, p_vivenu_transaction_id text DEFAULT NULL::text, p_ticket_type_map_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if auth.uid() is not null and not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.source not in ('speaker', 'speaker_companion') then raise exception 'not_a_free_ticket' using errcode = 'P0001', detail = v_t.source; end if;
  -- SPK-068: Der Webhook `ticket.created` kann schneller sein als die
  -- Server-Action und das Ticket bereits auf `valid` gesetzt haben. Traegt die
  -- Zeile dieselbe vivenu-Kennung, ist nichts mehr zu tun — ein Fehler hier
  -- hiesse: das Ticket existiert bei vivenu, die Oberflaeche meldet aber einen
  -- Fehlschlag, und der naechste Klick legte ein zweites an. Schuetzt zugleich
  -- gegen den Doppelklick.
  if v_t.vivenu_ticket_id is not null and v_t.vivenu_ticket_id = btrim(coalesce(p_vivenu_ticket_id, '')) then
    -- Still zurueckkehren, aber nicht spurlos: die Admin-Aktion hat stattgefunden
    -- und gehoert ins Audit-Log, auch wenn der Webhook die Zeile schon gefuellt hat.
    perform log_audit('ticket.issued', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                      jsonb_build_object('status', v_t.status, 'source', v_t.source,
                                         'vivenu_ticket_id', v_t.vivenu_ticket_id, 'via', 'webhook_first'));
    -- Auch hier: das Ticket **ist** ausgestellt, die Inhaberin soll es erfahren.
    -- Ohne diese Zeile bekaeme genau die Person keine Mail, bei der der Webhook
    -- schneller war — ein Zufall der Laufzeit entschiede ueber die Post.
    perform ticket_final_mail(v_t);
    return;
  end if;
  if v_t.source = 'speaker' and v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  if v_t.source = 'speaker_companion' and v_t.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001', detail = v_t.status; end if;
  if nullif(btrim(coalesce(p_barcode, '')), '') is null or nullif(btrim(coalesce(p_vivenu_ticket_id, '')), '') is null then
    raise exception 'barcode_required' using errcode = '22023';
  end if;
  update ticket set status = 'valid', barcode = btrim(p_barcode), vivenu_ticket_id = btrim(p_vivenu_ticket_id),
                    vivenu_transaction_id = coalesce(nullif(btrim(p_vivenu_transaction_id), ''), vivenu_transaction_id),
                    ticket_type_map_id = coalesce(p_ticket_type_map_id, ticket_type_map_id), purchased_at = now()
   where id = p_ticket_id;
  perform log_audit('ticket.issued', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'valid', 'source', v_t.source, 'vivenu_ticket_id', btrim(p_vivenu_ticket_id)));
  -- Frisch gelesen: `v_t` ist der Stand **vor** dem Update und traegt weder
  -- Status noch Kennung von eben. Fuer die Mail zaehlt der Halter, der sich
  -- nicht aendert — die Zeile neu zu lesen kostet nichts und erspart die Frage.
  select * into v_t from ticket where id = p_ticket_id;
  perform ticket_final_mail(v_t);
end $$;

select harden_definer_functions();
