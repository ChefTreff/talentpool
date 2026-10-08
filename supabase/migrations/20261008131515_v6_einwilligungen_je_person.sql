-- 0279 · Einwilligungen je Person im Admin (ADM-096)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008131515.
-- 00NN · Einwilligungen je Person (ADM-096)
--
-- Anlass: Konrad 08.10.2026 (Admin-Feedback Teil 1): „Einwilligungen je Person statt je Datensatz: pro Person alle
-- Einwilligungen mit Status erteilt/abgelehnt“. `consent_records_admin` liefert weiter jede Zeile des Nachweises
-- (Verlauf, bleibt für die Personenseite und die Ansicht „je Eintrag“); neu ist die Sicht **eine Zeile je Person**.
--
-- `consent_overview_admin(p_type, p_state, p_query, p_limit, p_offset)` — Abschnitt `consents`:
--   * je Person der **aktuelle Stand je Einwilligungsart** (jüngster Eintrag je Person und Art, derselbe Schnitt wie
--     die View `consent_current`: granted_at, created_at, id absteigend). Zustand: `revoked` (Eintrag widerrufen),
--     `granted` (erteilt), `declined` (abgelehnt). Arten ohne Eintrag stehen nicht in der Liste (`states`).
--   * Filter: `p_type` (nur Personen mit einem Eintrag dieser Art), `p_state` (Zustand; zusammen mit `p_type` der
--     Zustand **dieser** Art, allein der Zustand **irgendeiner** Art). Die Spalte `states` zeigt trotzdem alle Arten
--     der Person — der Filter wählt Personen aus, er verschweigt nichts.
--   * Suche: jedes Wort in Name oder E-Mail-Adresse (`%`, `_`, `\` zählen als Zeichen).
--   * Sortierung: zuletzt Geändertes zuerst (jüngster Eintrag bzw. Widerruf über alle Arten).
--   * Anonymisierte Personen fehlen (kein Name, keine Adresse); ihre Nachweiszeilen bleiben in `consent_records_admin`.
--   * Ein unbekannter Zustand ⇒ 22023 `invalid_state` (wie `consent_records_admin`).
-- Fehlerschlüssel: 28000 · 42501 · 22023 `invalid_state`.
set search_path = public, extensions;

create or replace function consent_overview_admin(p_type text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(person_id uuid, person_name text, email text, states jsonb, last_change timestamp with time zone, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
        v_type text := nullif(btrim(coalesce(p_type, '')), '');
        v_words text[];
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('consents') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_state is not null and p_state not in ('granted', 'declined', 'revoked') then
    raise exception 'invalid_state' using errcode = '22023', detail = p_state;
  end if;
  select coalesce(array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')), '{}')
    into v_words from unnest(string_to_array(coalesce(p_query, ''), ' ')) as w where w <> '';

  return query
  with aktuell as (
    select distinct on (c.person_id, c.consent_type)
           c.person_id as pid, c.consent_type as art, c.version as fassung, c.granted_at as seit, c.revoked_at as widerruf,
           case when c.revoked_at is not null then 'revoked' when c.granted then 'granted' else 'declined' end as zustand
      from consent_record c
     order by c.person_id, c.consent_type, c.granted_at desc, c.created_at desc, c.id desc
  ), je_person as (
    select a.pid,
           jsonb_agg(jsonb_build_object('type', a.art, 'version', a.fassung, 'state', a.zustand,
                                        'at', coalesce(a.widerruf, a.seit)) order by a.art) as stand,
           max(coalesce(a.widerruf, a.seit)) as zuletzt
      from aktuell a
     group by a.pid
  ), treffer as (
    select p.id as pid, je.stand, je.zuletzt,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name,
           (select pe.email::text from person_email pe where pe.person_id = p.id
             order by pe.is_primary desc, pe.created_at limit 1) as mail
      from je_person je
      join person p on p.id = je.pid and p.deleted_at is null
     where ((v_type is null and p_state is null)
            or exists (select 1 from aktuell a
                        where a.pid = p.id
                          and (v_type is null or a.art = v_type)
                          and (p_state is null or a.zustand = p_state)))
       and not exists (
             select 1 from unnest(v_words) as w
              where not (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') ilike '%' || w || '%' escape '\'
                      or coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '') ilike '%' || w || '%' escape '\'
                      or exists (select 1 from person_email pe where pe.person_id = p.id
                                  and pe.email::text ilike '%' || w || '%' escape '\')))
  )
  select t.pid, t.name, t.mail, t.stand, t.zuletzt, count(*) over ()
    from treffer t
   order by t.zuletzt desc, t.pid
   limit v_limit offset v_offset;
end $$;

select harden_definer_functions();
