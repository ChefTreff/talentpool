-- 0089 · Welle 4 · Hackathon: die deutschen Spalten werden auch gelesen
--
-- Befund aus dem Walkthrough am 14.09.2026: deutsche Navigation, englische
-- Inhalte — und zwar auch dort, wo eine deutsche Fassung im Feld steht.
-- 0085 liest überall `coalesce(c.title_en, c.title_de)`. Weil `title_en`
-- `not null` ist, gewinnt Englisch immer; `title_de` und `description_de`
-- sind totes Gewicht. Das Challenge-Formular fragt sie trotzdem ab
-- (`label_de`: „Titel (englisch)" neben den optionalen deutschen Feldern) —
-- ein Partner füllt sie also aus, und niemand sieht das Ergebnis je.
--
-- Der Hackathon läuft auf Englisch (E7), das bleibt: `p_language` ist
-- standardmässig `'en'`, und ohne deutsche Fassung kommt weiterhin die
-- englische. Neu ist nur, dass eine vorhandene deutsche Fassung eine deutsche
-- Leserin auch erreicht — dieselbe Regel wie in der Wissensbasis (0088):
-- gefragte Sprache zuerst, die andere als Rückfall, nie Leere.
--
-- Signaturänderung: die vier Funktionen bekommen `p_language text` **hinter**
-- den bisherigen Parametern. `create or replace` legte dabei eine zweite
-- Überladung an, und ein Aufruf mit einem Argument wäre mehrdeutig geworden
-- (42725) — deshalb vorher `drop function`. Rechte, Fehlerschlüssel und
-- Rückgabespalten bleiben, wie sie waren. Test unten.

drop function if exists hack_challenges(uuid);
drop function if exists my_hack(uuid);
drop function if exists hack_judging(uuid);
drop function if exists hack_admin_overview(uuid);

/**
 * Welche Fassung ein Leser bekommt. Eigene kleine Funktion, damit die Regel
 * an einer Stelle steht und nicht viermal abgeschrieben wird.
 */
create or replace function hack_text(p_de text, p_en text, p_language text)
returns text
language sql immutable set search_path = public, extensions as $$
  select case when p_language = 'de' then coalesce(nullif(btrim(p_de), ''), p_en)
              else coalesce(nullif(btrim(p_en), ''), p_de) end
$$;

create or replace function hack_challenges(p_edition_id uuid default null,
                                           p_language text default 'en')
returns table(id uuid, title text, description text, prizes text, resources text,
              mentors jsonb, criteria jsonb, org_name text, teams integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language),
           hack_text(c.description_de, c.description_en, p_language),
           c.prizes, c.resources, c.mentors, c.criteria,
           coalesce(o.communication_name, o.legal_name),
           (select count(*)::integer from hack_team t where t.challenge_id = c.id and t.status <> 'withdrawn')
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;

create or replace function my_hack(p_edition_id uuid default null,
                                   p_language text default 'en') returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ed uuid; v_app hack_application; v_team hack_team;
        v_sub hack_submission; v_ch hack_challenge;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  select * into v_app from hack_application where person_id = v_me and edition_id = v_ed;
  select t.* into v_team from hack_team t join hack_team_member m on m.team_id = t.id
   where m.person_id = v_me and t.edition_id = v_ed;
  if v_team.id is not null then
    select * into v_sub from hack_submission where team_id = v_team.id;
    select * into v_ch from hack_challenge where id = v_team.challenge_id;
  end if;

  return jsonb_build_object(
    'edition_id', v_ed,
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'skills', to_jsonb(v_app.skills),
      'motivation', v_app.motivation, 'team_pref', v_app.team_pref, 'applied_at', v_app.applied_at) end,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'status', v_team.status,
      -- Den Beitrittscode sieht nur, wer schon drin ist.
      'join_code', v_team.join_code, 'discord_url', v_team.discord_url,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'person_id', p.id, 'name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    'is_captain', m.is_captain) order by m.joined_at), '[]'::jsonb)
                  from hack_team_member m join person p on p.id = m.person_id where m.team_id = v_team.id)) end,
    'challenge', case when v_ch.id is null then null else jsonb_build_object(
      'id', v_ch.id, 'title', hack_text(v_ch.title_de, v_ch.title_en, p_language),
      'description', hack_text(v_ch.description_de, v_ch.description_en, p_language),
      'prizes', v_ch.prizes, 'resources', v_ch.resources, 'criteria', v_ch.criteria) end,
    'submission', case when v_sub.id is null then null else jsonb_build_object(
      'url', v_sub.url, 'repo_url', v_sub.repo_url, 'notes', v_sub.notes,
      'submitted_at', v_sub.submitted_at) end);
end $$;

create or replace function hack_admin_overview(p_edition_id uuid default null,
                                               p_language text default 'en')
returns table(team_id uuid, team_name text, status text, members integer, captain text,
              challenge_id uuid, challenge_title text, submitted_at timestamptz,
              scores integer, avg_total numeric)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.status,
           (select count(*)::integer from hack_team_member m where m.team_id = t.id),
           (select nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
              from hack_team_member m join person p on p.id = m.person_id
             where m.team_id = t.id and m.is_captain limit 1),
           t.challenge_id, hack_text(c.title_de, c.title_en, p_language),
           s.submitted_at,
           (select count(*)::integer from hack_judging_score j where j.team_id = t.id),
           (select round(avg(j.total), 2) from hack_judging_score j where j.team_id = t.id)
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
     order by t.name;
end $$;

create or replace function hack_judging(p_edition_id uuid default null,
                                        p_language text default 'en')
returns table(team_id uuid, team_name text, challenge_title text, criteria jsonb,
              submission_url text, repo_url text, notes text, submitted_at timestamptz,
              my_criteria jsonb, my_total numeric, my_note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, hack_text(c.title_de, c.title_en, p_language), coalesce(c.criteria, '[]'::jsonb),
           s.url, s.repo_url, s.notes, s.submitted_at,
           j.criteria, j.total, j.note
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
      left join hack_judging_score j on j.team_id = t.id and j.judge_id = current_person_id()
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
       -- Partner-Jury: nur die Teams der eigenen Challenge.
       and can_judge_hack_team(t.id)
     order by t.name;
end $$;

select harden_definer_functions();
