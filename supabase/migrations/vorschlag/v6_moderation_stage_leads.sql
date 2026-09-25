-- 00NN · LEAD-042: Stage Leads als Moderation im Programm-Board wählbar
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad, Klickrunde 25.09. (LEAD-042): „Moderation kann ein Stage Lead
-- sein, Stage Leads stehen aber nicht unter den Speakern.“ Entscheidung im
-- Backlog: eine Person mit der Rolle `speaker_manager` ist als Moderation
-- wählbar, **ohne Speaker-Hub** — kein Speaker-Profil, kein Ticket, keine Mails.
--
-- Befund: `set_session_speakers` nimmt jede Person an, ein Speaker-Profil ist
-- keine Bedingung. Es fehlte allein die Suche: `board_search_people` findet nur
-- Personen mit Speaker-Profil der Edition.
--
-- Neu:
--   * `board_search_people(p_event_id, p_query, p_limit, p_moderation)`: mit
--     `p_moderation = true` kommen **Stage Leads der Edition** dazu — Personen mit
--     einer aktiven Rolle `speaker_manager`, deren Edition (`edition_id`) oder
--     Bühne (Scope `stage`) zu dieser Edition gehört. Wer schon ein Speaker-Profil
--     hat, erscheint einmal, als Speaker. Globale Speaker-Manager sind internes
--     Team und stehen nicht in der Liste.
--   * Neue Ausgabespalte `is_stage_lead` — die Oberfläche beschriftet damit den
--     Treffer. Der Rückgabetyp wächst ⇒ drop + create; die alte Signatur mit drei
--     Parametern fällt weg (sonst entstünde ein Overload).
--   * Suchen darf wie bisher, wer `can_search_board` hat (Programm-Team und
--     Speaker-Leads). Partner erreichen die Funktion nicht — Namen externer
--     Bühnenleitungen gehören nicht in ihre Suche.
--
-- Folgen einer Moderation ohne Speaker-Profil (geprüft gegen den Snapshot):
-- `send_presentation_reminders` verlangt ein bestätigtes Profil — keine Mail;
-- `event_app_speakers` exportiert Profile — keine Swapcard-Zeile; `is_speaker_of`
-- gibt ihr, wie jeder Moderation, die Speaker-Seite dieser einen Session.
--
-- Funktion aus `supabase/snapshot/functions/`: `board_search_people`.
-- Fehlerschlüssel unverändert: 28000, 42501.

set search_path = public, extensions;

drop function if exists board_search_people(uuid, text, integer);

create function board_search_people(p_event_id uuid, p_query text, p_limit integer DEFAULT 10, p_moderation boolean DEFAULT false)
 RETURNS TABLE(id uuid, display_name text, organization text, is_stage_lead boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_q text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_search_board(p_event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = p_event_id;
  v_q := board_like_pattern(p_query);
  return query
    select x.pid, x.name, x.org, x.lead
      from (
        select p.id as pid,
               nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name,
               sp.organization_name as org,
               false as lead,
               p.last_name as ln, p.first_name as fn
          from speaker_profile sp
          join person p on p.id = sp.person_id
         where sp.edition_id = v_ed
           and p.deleted_at is null
           and (p.first_name ilike v_q or p.last_name ilike v_q
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
                or coalesce(sp.organization_name, '') ilike v_q)
        union all
        -- LEAD-042: Stage Leads der Edition, nur für die Moderation und nur,
        -- wer nicht schon als Speaker oben steht.
        select p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
               null::text, true, p.last_name, p.first_name
          from person p
         where coalesce(p_moderation, false)
           and p.deleted_at is null
           and not exists (select 1 from speaker_profile sp2 where sp2.person_id = p.id and sp2.edition_id = v_ed)
           and exists (
             select 1 from role_assignment ra
              where ra.person_id = p.id
                and ra.role = 'speaker_manager'
                and ra.valid_from <= now()
                and (ra.valid_to is null or ra.valid_to > now())
                and (ra.edition_id = v_ed
                     or (ra.scope_type = 'stage' and exists (
                           select 1 from stage st join event ev on ev.id = st.event_id
                            where st.id = ra.scope_id and (ev.id = v_ed or ev.edition_id = v_ed)))))
           and (p.first_name ilike v_q or p.last_name ilike v_q
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q)
      ) x
     order by x.ln nulls last, x.fn nulls last
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

comment on function board_search_people(uuid, text, integer, boolean) is
  'Personensuche im Programm-Board: Speaker der Edition; mit p_moderation zusätzlich Stage Leads der Edition (is_stage_lead, LEAD-042). Nur für can_search_board.';

select harden_definer_functions();
