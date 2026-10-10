-- 0000 · Ticketmail über vivenu und Erinnerung an offene Personalisierung (TAL-019 Teil 3, K-93)
-- Anlass: Konrad 09.10. (K-93 „wie empfohlen“): nach der Personalisierung im Portal lässt das Portal das Ticket von vivenu per Mail an die Inhaber-Adresse
-- schicken (Event „Tickets nicht versenden“ stellt Konrad), und wer die Angaben nach sieben Tagen noch nicht ergänzt hat, bekommt eine Erinnerung über unsere
-- Mail-Warteschlange (DE/EN, Vorlage im Admin editierbar). Keine neue Tabelle, nichts für Teilnehmende lesbar.
--   1 `ticket.vivenu_mailed_at` (vivenu hat den Versand angenommen) und `ticket.personalization_reminded_at` (Erinnerung eingereiht) — beide nur vom Server gesetzt.
--   2 `tickets_mail_pending(p_limit)`: gültige vivenu-Tickets, im Portal vollständig personalisiert (`personalized_at` gesetzt), Rückschreiben erledigt,
--     mit Inhaber-Adresse, Versand noch offen — für den Sweep. Nur Service-Aufruf (`auth.uid()` leer), sonst 42501.
--   3 `remind_ticket_personalization()`: je Käufer-Person und Bestellung **eine** Erinnerung für alle Tickets mit pending/partial, die älter als sieben Tage sind
--     (Kauf, sonst Anlage), zu einer noch laufenden Edition; danach `personalization_reminded_at` gesetzt (einmal je Ticket). Nur Service-Aufruf.
--     Abweichung vom Wortlaut „einmal je Ticket“: ein Käufer mit vier offenen Tickets bekommt eine Mail mit der Zahl, nicht vier.
--   4 Vorlage `ticket_personalization_reminder` (DE/EN) und Verzeichniseintrag mit Platzhaltern.

alter table ticket add column if not exists vivenu_mailed_at timestamptz;
alter table ticket add column if not exists personalization_reminded_at timestamptz;
comment on column ticket.vivenu_mailed_at is 'TAL-019 Teil 3: vivenu hat den Versand des Tickets an die Inhaber-Adresse angenommen (nur Server).';
comment on column ticket.personalization_reminded_at is 'TAL-019 Teil 3: die Erinnerung an die offene Personalisierung ist eingereiht (einmal je Ticket, nur Server).';

create or replace function tickets_mail_pending(p_limit integer default 50)
 returns table(ticket_id uuid)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id from ticket t
     where t.source = 'vivenu' and t.status = 'valid'
       and t.personalization_status = 'complete' and t.personalized_at is not null
       and t.vivenu_ticket_id is not null and t.holder_email is not null
       and not t.vivenu_writeback_pending and t.vivenu_mailed_at is null
     order by t.personalized_at
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

create or replace function remind_ticket_personalization()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_row record; v_n integer := 0;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  for v_row in
    select g.person_id, g.tx, g.edition_name, count(*)::integer as n, array_agg(g.id) as ids
      from (
        select t.id, t.vivenu_transaction_id as tx, ed.name as edition_name,
               (select pe.person_id from person_email pe join person p on p.id = pe.person_id and p.deleted_at is null
                 where pe.email = t.buyer_email order by pe.is_primary desc, pe.created_at limit 1) as person_id
          from ticket t
          join event te on te.id = t.event_id
          join event ed on ed.id = coalesce(te.edition_id, te.id)
         where t.source = 'vivenu' and t.status = 'valid'
           and t.personalization_status in ('pending', 'partial')
           and t.personalization_reminded_at is null
           and coalesce(t.purchased_at, t.created_at) < now() - interval '7 days'
           and coalesce(ed.end_date, ed.start_date, now()::date + 1) >= now()::date
      ) g
     where g.person_id is not null
     group by g.person_id, g.tx, g.edition_name
  loop
    perform queue_mail('ticket_personalization_reminder', v_row.person_id,
      jsonb_build_object('edition', v_row.edition_name, 'n', v_row.n,
                         'link_path', case when v_row.tx is not null and v_row.tx ~ '^[A-Za-z0-9_-]{1,120}$'
                                           then '/tickets/bestaetigung?transactionId=' || v_row.tx else '/tickets' end),
      'ticket', v_row.ids[1]);
    update ticket set personalization_reminded_at = now() where id = any(v_row.ids);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function tickets_mail_pending(integer) from public, anon, authenticated;
revoke execute on function remind_ticket_personalization() from public, anon, authenticated;
grant execute on function tickets_mail_pending(integer) to service_role;
grant execute on function remind_ticket_personalization() to service_role;

insert into mail_template (key, locale, subject, body_md, active) values
  ('ticket_personalization_reminder', 'de',
   'Noch ein Schritt: Trag ein, wer zum Summit kommt',
   E'Hallo {{first_name}},\n\nzu deiner Bestellung für {{edition}} fehlen noch Angaben auf {{n}} Ticket(s). Sobald sie eingetragen sind, schickt dir der Ticketanbieter das Ticket per Mail, und das Namensschild kann gedruckt werden.\n\n[Angaben ergänzen]({{portal_url}}{{link_path}})\n\nDas dauert eine Minute. Du kannst die Tickets auch an Kolleginnen und Kollegen weitergeben, indem du deren E-Mail-Adresse einträgst.\n\nDanke dir!\nDein ChefTreff-Team',
   true),
  ('ticket_personalization_reminder', 'en',
   'One more step: tell us who is coming to the summit',
   E'Hi {{first_name}},\n\ndetails are still missing on {{n}} ticket(s) of your order for {{edition}}. As soon as they are filled in, the ticket provider emails you the ticket and the name badge can be printed.\n\n[Add the details]({{portal_url}}{{link_path}})\n\nIt takes a minute. You can also pass tickets on to colleagues by entering their email address.\n\nThank you!\nYour ChefTreff team',
   true)
on conflict (key, locale) do nothing;

insert into mail_template_key (key, category, name_de, name_en, variables, sort_order) values
  ('ticket_personalization_reminder', 'participant', 'Erinnerung: Ticket-Angaben fehlen', 'Reminder: ticket details missing',
   array['first_name', 'edition', 'n', 'link_path', 'portal_url'], 80)
on conflict (key) do nothing;

select harden_definer_functions();
