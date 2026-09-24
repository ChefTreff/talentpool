-- 0000 · Format-Details für Teilnehmende (TAL-002/003): eine Bewerbung, vier Formate.
--
-- Anlass: TAL-002/003 (Konrad 17.09.2026, P2): Bewerbung für Masterclass, Company Tour,
-- Side-Event und Interview Table **gleich aufgebaut**, mit den Format-Details (Zeit, Ort, Bild,
-- gesuchte Profile, Hinweise zur Anmeldung). Die Oberfläche bewirbt längst formatunabhängig
-- über `access_mode`; `programme_public` gibt die Details aber nicht heraus
-- (`session.format_details`, 0132; Company Tours mit eigenem Modell, 0134, D5).
--
-- 1. `programme_format_details()` — je **veröffentlichter** Session der vier Formate:
--    Gastgeber (Kommunikationsname), Ort (Side-Event: `location_text`), Bildpfad (Side-Event:
--    Partner-Datei, nicht abgelehnt), Interview Table: Stellentitel, Stellentext, Link,
--    Einzel-/Gruppengespräch, gesuchte Profile; Company Tour: Tour mit Sammelpunkt, Zeiten und
--    Stopps (Gastgeber, Adresse, Zeitfenster, Hinweise, gesuchte Profile).
--    **Nie** heraus: `contact_*` der Stopps, interne Notizen, Snacks/Foto-Angaben.
--    Der Bildpfad verlässt den Server nicht — die Seite signiert ihn (Dienstschlüssel, nur
--    Pfade aus dieser Funktion).
-- 2. `company_tour.session_id` (neu, optional, eindeutig): die Session, auf die man sich für
--    diese Tour bewirbt. Bisher hatte eine Tour keinen Bewerbungsweg im Teilnehmer-Portal.
--    **Offene Frage an Konrad** (PR): wer verknüpft — Vorschlag: das Team im Admin
--    (`upsert_company_tour` bekommt das Feld in einem Folge-PR des Admin-Chats; diese
--    Migration ändert die Funktion nicht).
--
-- Fehlerschlüssel: 28000 ohne Person. Test: supabase/tests/v6_format_details_public.sql
set search_path = public, extensions;

alter table company_tour add column if not exists session_id uuid references session (id) on delete set null;
create unique index if not exists company_tour_session_uidx on company_tour (session_id) where session_id is not null;
comment on column company_tour.session_id is
  'Die Session, auf die sich Teilnehmende für diese Tour bewerben (TAL-003). Optional; ohne sie gibt es für die Tour keinen Bewerbungsweg im Portal.';

create or replace function programme_format_details()
returns table (session_id uuid, format text, host_name text, location_text text, image_path text,
               job_title text, job_posting_text text, job_posting_url text, interview_mode text,
               target_profile jsonb, tour jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select s.id, s.format,
           nullif(btrim(coalesce(o.communication_name, o.legal_name)), ''),
           nullif(s.format_details->>'location_text', ''),
           (select pa.storage_path from partner_asset pa
             where s.format = 'side_event'
               and pa.id = nullif(s.format_details->>'image_asset_id', '')::uuid
               and pa.status <> 'rejected'),
           nullif(s.format_details->>'job_title', ''),
           nullif(s.format_details->>'job_posting_text', ''),
           nullif(s.format_details->>'job_posting_url', ''),
           nullif(s.format_details->>'interview_mode', ''),
           case when s.format_details ? 'target_profile' then s.format_details->'target_profile' end,
           (select jsonb_build_object(
                     'name', ct.name,
                     'meeting_point', ct.meeting_point,
                     'starts_at', ct.starts_at,
                     'ends_at', ct.ends_at,
                     'stops', coalesce((
                       select jsonb_agg(jsonb_build_object(
                                'sort_order', st.sort_order,
                                'host_name', nullif(btrim(coalesce(so.communication_name, so.legal_name)), ''),
                                'address', st.address,
                                'arrival_at', st.arrival_at,
                                'departure_at', st.departure_at,
                                'notes_public', st.notes_public,
                                'target_profile', st.target_profile)
                              order by st.sort_order)
                         from company_tour_stop st
                         left join organization so on so.id = st.host_org_id
                        where st.tour_id = ct.id), '[]'::jsonb))
              from company_tour ct where ct.session_id = s.id)
      from session s
      left join organization o on o.id = coalesce(s.host_org_id, s.partner_org_id)
     where s.publish_status = 'published'
       and s.format in ('masterclass', 'company_tour', 'interview_table', 'side_event');
end $$;

comment on function programme_format_details() is
  'TAL-002/003: Format-Details veröffentlichter Bewerbungsformate für Teilnehmende. Ohne Kontaktdaten und interne Notizen; Bildpfad nur zur serverseitigen Signatur.';

select harden_definer_functions();
