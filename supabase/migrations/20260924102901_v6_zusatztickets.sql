-- 0154 · Welle 6 · Zusatztickets strukturiert (PART-070): shop_request.pass_type/quantity, eigene Mailvorlage, my_ticket_requests, ticket_requests_admin
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924102901.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, Eingang 21./24.09. — „Prozess ungetestet → die Anfrage löst eine Mail an
-- Konrad aus (prüfen, bestätigen); neue Sektion ‚Zusatzkontingent' zeigt Anfrage und Freigabe."
--
-- **Was der Test am 24.09. ergeben hat.** Der Weg funktioniert, aber nur halb:
--
--   * **Die Mail kommt zufällig an.** `request_ticket_increase` ruft `notify_partner_leads`, und
--     die schreibt an alle mit Rolle `area_lead_partner` — heute **niemand** — und ersatzweise an
--     alle globalen Admins. Konrad bekommt die Mail also nur, weil er der einzige Admin ist.
--     Das ist kein Fehler im Code, aber eine Annahme, die still bricht, sobald jemand die Rolle
--     bekommt. Steht im PR für Konrad; das Routing ändern wir hier nicht.
--   * **Die Mail heißt falsch.** Sie nutzt die Vorlage `shop_request_received`: Betreff
--     „Messeshop-Anfrage", Text „fragt im Messeshop an", Verweis „Antwort unter Messeshop →
--     Anfragen". Wer Zusatztickets freigeben soll, bekommt eine Mail, die nach einer
--     Bestellfrage aussieht. Jetzt eine eigene Vorlage `ticket_request_received`.
--   * **Anzahl und Tickettyp stehen nur im Freitext** („5 zusätzliche Tickets (partner).").
--     Eine Sektion, die Anfrage und Freigabe zeigt, müsste diesen Text zerlegen — und bräche
--     beim ersten umformulierten Satz. Deshalb zwei Spalten an `shop_request`.
--
-- **Warum Spalten an `shop_request` und keine eigene Tabelle.** Eine Ticketanfrage ist eine
-- Anfrage wie jede andere im Partner-Admin: sie hat einen Status, eine Antwort, wer wann
-- geantwortet hat. Das alles gibt es schon (`shop_request_answer`). Eine zweite Tabelle
-- verdoppelte diese Mechanik. Die zwei Spalten sind leer bei jeder Anfrage, die kein
-- Ticketwunsch ist; ein CHECK sorgt dafür, dass sie nur zusammen gesetzt werden.
--
-- Bestand: null Ticketanfragen (geprüft 24.09.) — keine Übernahme nötig.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Struktur

alter table shop_request add column if not exists pass_type text;
alter table shop_request add column if not exists quantity integer;

alter table shop_request drop constraint if exists shop_request_ticket_chk;
-- `quantity is not null` steht ausdrücklich da, obwohl `quantity > 0` es scheinbar schon
-- verlangt: bei `quantity = NULL` ist `quantity > 0` weder wahr noch falsch, sondern NULL, und
-- ein CHECK lässt NULL **durch**. Die erste Fassung hatte genau diese Lücke — der Test hat
-- einen Typ ohne Anzahl angelegt, und die Datenbank hat ihn angenommen.
alter table shop_request add constraint shop_request_ticket_chk
  check ((pass_type is null and quantity is null)
      or (pass_type is not null and quantity is not null and quantity > 0));

comment on column shop_request.pass_type is
  'Nur bei Zusatzticket-Anfragen (PART-070): Tickettyp aus dem Vokabular `ticket_type`. NULL bei jeder anderen Anfrage.';
comment on column shop_request.quantity is
  'Nur bei Zusatzticket-Anfragen: wie viele zusätzlich. Zusammen mit `pass_type` gesetzt oder gar nicht (CHECK).';

-- ---------------------------------------------------------------- 2) Anfrage stellen

-- Wortgleich aus `supabase/snapshot/functions/request_ticket_increase.sql`; geändert sind drei
-- Dinge: die zwei Spalten werden gefüllt, die Mail nutzt die eigene Vorlage, und sie bekommt
-- Anzahl und Tickettyp in beiden Sprachen als eigene Platzhalter.
create or replace function request_ticket_increase(p_org_id uuid, p_pass_type text, p_additional integer, p_text text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_sku text; v_id uuid; v_org_name text; v_label text;
        v_label_de text; v_label_en text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_additional, 0) <= 0 then raise exception 'quantity_required' using errcode = '22023'; end if;
  if p_pass_type not in ('partner', 'talent', 'startup', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  select pr.sku into v_sku from product pr where pr.pass_type = case when p_pass_type = 'startup' then 'talent' else p_pass_type end and pr.active order by pr.sku limit 1;
  v_label := format('Tickets %s (+%s)', p_pass_type, p_additional);
  -- Die Bezeichnung aus dem Vokabular, damit in der Mail „Partner Pass" steht und nicht der
  -- interne Schlüssel „partner". Fehlt der Eintrag, bleibt der Schlüssel stehen.
  select coalesce(t.label_de, p_pass_type), coalesce(t.label_en, p_pass_type) into v_label_de, v_label_en
    from vocab_term t where t.vocabulary = 'ticket_type' and t.key = p_pass_type;
  insert into shop_request (org_edition_id, product_sku, text, created_by, pass_type, quantity)
  values (v_oe.id, v_sku, format('%s zusätzliche Tickets (%s).%s', p_additional, p_pass_type, case when nullif(btrim(coalesce(p_text, '')), '') is null then '' else ' ' || btrim(p_text) end), v_me,
          p_pass_type, p_additional)
  returning id into v_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
  perform notify_partner_leads('ticket_request_received',
    jsonb_build_object('org_name', v_org_name, 'product', v_label, 'quantity', p_additional,
                       'pass_type_de', coalesce(v_label_de, p_pass_type), 'pass_type_en', coalesce(v_label_en, p_pass_type),
                       'text', coalesce(nullif(btrim(coalesce(p_text, '')), ''), '–')),
    'shop_request', v_id);
  perform log_audit('ticket.request_increase', 'shop_request', v_id::text, null, jsonb_build_object('org_id', p_org_id, 'pass_type', p_pass_type, 'additional', p_additional));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 3) Die Mail

-- Der Link führt dorthin, wo die Freigabe wirklich passiert: zu den Kontingenten. Dort stehen
-- die offenen Anfragen jetzt neben der Tabelle, in der das Kontingent erhöht wird.
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active
from (values
  ('ticket_request_received', 'de', 1, 'Zusatztickets angefragt: {{org_name}}',
   E'Hallo {{first_name}},\n\n{{org_name}} fragt **{{quantity}} zusätzliche {{pass_type_de}}** an.\n\nNachricht: {{text}}\n\nFreigeben heißt: das Kontingent erhöhen und die Anfrage beantworten — beides auf derselben Seite.\n\n[Zu den Kontingenten]({{portal_url}}/admin/partner/kontingente)\n\nViele Grüße\nChefTreff',
   'Nachricht an das Partner-Team, wenn ein Partner Zusatztickets anfragt (PART-070)', true),
  ('ticket_request_received', 'en', 1, 'Additional tickets requested: {{org_name}}',
   E'Hi {{first_name}},\n\n{{org_name}} is requesting **{{quantity}} additional {{pass_type_en}}**.\n\nMessage: {{text}}\n\nApproving means raising the quota and answering the request — both on the same page.\n\n[Go to quotas]({{portal_url}}/admin/partner/kontingente)\n\nBest\nChefTreff',
   'Notice to the partner team when a partner requests additional tickets (PART-070)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- ---------------------------------------------------------------- 4) Lesen: Partner

-- Die eigenen Zusatzanfragen für die Sektion „Zusatzkontingent" auf `/partner/tickets`.
-- Der Freitext bleibt draußen: er trägt den internen Schlüssel („(partner)") und dient dem
-- Team; der Partner sieht Anzahl und Typ strukturiert, dazu Stand und Antwort.
create or replace function my_ticket_requests(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, pass_type text, quantity integer, status text, answer text,
               created_at timestamptz, answered_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select r.id, r.pass_type, r.quantity, r.status, r.answer, r.created_at, r.answered_at
      from shop_request r
     where r.org_edition_id = v_oe.id and r.pass_type is not null
     order by r.created_at desc;
end $$;
revoke execute on function my_ticket_requests(uuid, uuid) from public, anon;
grant execute on function my_ticket_requests(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- 5) Lesen: Team

-- Offene und beantwortete Zusatzanfragen aller Partner einer Edition — für die Kontingente-
-- Seite im Admin (Regel vom 22.09.: was ein Portal kann, sieht und bearbeitet der Admin auch).
create or replace function ticket_requests_admin(p_edition_id uuid default null)
returns table (id uuid, org_id uuid, org_name text, pass_type text, quantity integer, text text,
               status text, answer text, created_by_name text, created_at timestamptz, answered_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, oe.org_id, coalesce(o.communication_name, o.legal_name), r.pass_type, r.quantity, r.text,
           r.status, r.answer, btrim(concat_ws(' ', p.first_name, p.last_name)), r.created_at, r.answered_at
      from shop_request r
      join org_edition oe on oe.id = r.org_edition_id
      join organization o on o.id = oe.org_id
      left join person p on p.id = r.created_by
     where r.pass_type is not null
       and (p_edition_id is null or oe.edition_id = p_edition_id)
     -- Offene zuerst: das ist, was jemand tun muss.
     order by (r.status = 'open') desc, r.created_at desc;
end $$;
revoke execute on function ticket_requests_admin(uuid) from public, anon;
grant execute on function ticket_requests_admin(uuid) to authenticated;

select harden_definer_functions();
