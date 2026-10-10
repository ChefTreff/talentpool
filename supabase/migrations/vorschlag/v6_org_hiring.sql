-- 00NN · Matching Stufe 2a — „Wen sucht ihr?“ je Organisation: die Tabelle `org_hiring` (K-94, QS-070, PART-107)
-- Vorschlag des Partner-Chats, noch nicht angewendet. Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: Konrad hat das Matching-Konzept (`docs/konzept-qs070-matching.md`) mit K-94 bestätigt („wie empfohlen“). Stufe 1 hat das gemeinsame Vokabular und die Whitelists des Wunschprofils
-- bereinigt (#480, Teil B beim Talent-Chat); Stufe 2 gibt dem Partner den Ort, an dem er sagt, **wen er sucht**: je Organisation und Edition mehrere Einträge mit Kategorie
-- (`career_opportunities`: Praktikum, Werkstudium, Abschlussarbeit, Trainee, Einstieg …), Fachbereich (`function_area`), einem Freitext zur Rolle („Werkstudent Data Engineering“) und
-- — optional — Skills und Studienfeldern. Das ist der Ort, der heute fehlt (Befund Talent-Chat 09.10., Nr. 6); die Formate (Interview Table, Tour-Stopp, Masterclass) können ihr
-- Wunschprofil künftig daraus vorbelegen (PART-140, Stufe 2b — eine Vorbelegung, kein Verweis: das Format behält sein eigenes `target_profile`).
--
-- Was die Migration tut (eine Tabelle, drei Funktionen — keine bestehende Funktion, keine bestehende Spalte)
--   1  Tabelle `org_hiring` an `org_edition` (wie `org_step_check`, `on delete cascade`): Kategorie und Fachbereich Pflicht, `role_text` höchstens 120 Zeichen, `skills` und `study_fields`
--      als Schlüssel-Listen des Vokabulars, `published` (Voreinstellung **aus**: der Partner schaltet frei, was Teilnehmende sehen dürfen — wirksam erst mit dem Matching, Stufe 3).
--      **RLS an, kein Tabellenrecht für `anon` und `authenticated`**: gelesen und geschrieben wird nur über die Funktionen (wie bei `org_step_check`); für Stufe 3 kommt eine eigene
--      Lesefunktion für Teilnehmende dazu, nie ein Tabellenrecht.
--   2  `partner_org_hiring(p_org_id, p_edition_id)` — die Einträge einer Organisation; Partner der Organisation (jede Rolle) oder Team. `stable`, kein Schreibzugriff.
--   3  `set_org_hiring(p_org_id, p_id, …Felder…, p_edition_id)` — anlegen (`p_id` leer) oder ändern; Recht `partner_can_edit` (primary_ops, additional, signing, oder Team). Werte über `is_vocab_key`;
--      `nicht-interessiert` ist wie im Wunschprofil (Vorschlag `v6_matching_vokabular`, #480) gesperrt; höchstens zehn Einträge je Organisation und Edition. Ein fremder Eintrag wird abgewiesen, bevor etwas geändert wird.
--   4  `delete_org_hiring(p_id)` — Eintrag entfernen; Recht wie oben an der Organisation des Eintrags.
--
-- Audit (db-konventionen §2): `partner.org_hiring` und `partner.org_hiring_remove`, Objekt `org_edition`, nur `org_id`, `hiring_id`, die Schlüsselwerte von Kategorie und Fachbereich, `published` und die
-- Zahl der Skills und Studienfelder — **kein Freitext** (`role_text`) und keine Person (auch `created_by` steht nicht im Eintrag).
-- Fehlerschlüssel: `invalid_hiring` (22023, `detail` = Feld), `invalid_vocab` (22023, `detail` = Gruppe:Wert, gibt es schon), `too_many_hiring` (P0001, `detail` 10), `hiring_not_found` (P0002),
-- `org_edition_not_found` (P0002, gibt es schon); 28000 ohne Anmeldung, 42501 ohne Recht.
set search_path = public, extensions;

create table if not exists org_hiring (
  id                 uuid primary key default gen_random_uuid(),
  org_edition_id     uuid not null references org_edition(id) on delete cascade,
  career_opportunity text not null,
  function_area      text not null,
  role_text          text,
  skills             text[] not null default '{}',
  study_fields       text[] not null default '{}',
  published          boolean not null default false,
  created_by         uuid references person(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint org_hiring_role_text_chk check (role_text is null or (btrim(role_text) <> '' and length(role_text) <= 120)),
  constraint org_hiring_career_chk check (btrim(career_opportunity) <> '' and career_opportunity <> 'nicht-interessiert'),
  constraint org_hiring_area_chk check (btrim(function_area) <> '')
);

comment on table org_hiring is
  '„Wen sucht ihr?“ (PART-107, K-94 Stufe 2): je Organisation und Edition mehrere Einträge aus Kategorie (career_opportunities), Fachbereich (function_area), Freitext zur Rolle, optional Skills und Studienfeldern. Gelesen und geschrieben nur über partner_org_hiring, set_org_hiring, delete_org_hiring.';
comment on column org_hiring.published is
  'Der Partner schaltet frei, was Teilnehmende sehen dürfen. Voreinstellung aus; wirksam erst mit dem Matching (Stufe 3, nach dem Go-live) — vorher liest nur die Organisation und das Team.';
comment on column org_hiring.role_text is
  'Freitext zur Rolle, höchstens 120 Zeichen. Kommt nie ins Audit.';

create index if not exists org_hiring_org_edition_idx on org_hiring (org_edition_id, created_at, id);

alter table org_hiring enable row level security;
revoke all on org_hiring from anon, authenticated;
grant all on org_hiring to service_role;

-- ---------------------------------------------------------------- Lesen

create or replace function partner_org_hiring(p_org_id uuid, p_edition_id uuid default null)
returns table (
  id uuid, career_opportunity text, function_area text, role_text text,
  skills text[], study_fields text[], published boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_org_id is null or not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select h.id, h.career_opportunity, h.function_area, h.role_text, h.skills, h.study_fields, h.published, h.created_at, h.updated_at
      from org_hiring h
     where h.org_edition_id = v_oe.id
     order by h.created_at, h.id;
end $$;

-- ---------------------------------------------------------------- Schreiben

create or replace function set_org_hiring(
  p_org_id uuid, p_id uuid, p_career_opportunity text, p_function_area text, p_role_text text,
  p_skills text[], p_study_fields text[], p_published boolean, p_edition_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_oe org_edition; v_row org_hiring; v_id uuid; v_n integer; v_el text; v_neu boolean := p_id is null;
  v_career text := nullif(btrim(coalesce(p_career_opportunity, '')), '');
  v_area   text := nullif(btrim(coalesce(p_function_area, '')), '');
  v_role   text := nullif(btrim(coalesce(p_role_text, '')), '');
  v_skills text[]; v_fields text[];
  v_max constant integer := 10;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_org_id is null or not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_id::text; end if;

  -- Erst der bestehende Eintrag, dann der neue Zustand: wer ihn nicht bearbeiten darf, soll weder Werte noch Fehler an ihm lernen.
  if p_id is not null then
    select * into v_row from org_hiring where id = p_id for update;
    if not found then raise exception 'hiring_not_found' using errcode = 'P0002'; end if;
    if v_row.org_edition_id <> v_oe.id then raise exception 'not allowed' using errcode = '42501'; end if;
  end if;

  if v_career is null then raise exception 'invalid_hiring' using errcode = '22023', detail = 'career_opportunity'; end if;
  if v_area is null then raise exception 'invalid_hiring' using errcode = '22023', detail = 'function_area'; end if;
  if v_role is not null and length(v_role) > 120 then raise exception 'invalid_hiring' using errcode = '22023', detail = 'role_text'; end if;
  if not is_vocab_key('career_opportunities', v_career) then
    raise exception 'invalid_vocab' using errcode = '22023', detail = 'career_opportunities:' || v_career;
  end if;
  -- „Ich bin aktuell nicht interessiert an Jobangeboten“ beschreibt eine Person, nicht das, was ein Partner bietet (wie im Wunschprofil).
  if v_career = 'nicht-interessiert' then
    raise exception 'invalid_vocab' using errcode = '22023', detail = 'career_opportunities:' || v_career;
  end if;
  if not is_vocab_key('function_area', v_area) then
    raise exception 'invalid_vocab' using errcode = '22023', detail = 'function_area:' || v_area;
  end if;

  v_skills := array(select distinct btrim(x) from unnest(coalesce(p_skills, '{}'::text[])) x where nullif(btrim(x), '') is not null order by 1);
  foreach v_el in array v_skills loop
    if not is_vocab_key('skill', v_el) then raise exception 'invalid_vocab' using errcode = '22023', detail = 'skill:' || v_el; end if;
  end loop;
  v_fields := array(select distinct btrim(x) from unnest(coalesce(p_study_fields, '{}'::text[])) x where nullif(btrim(x), '') is not null order by 1);
  foreach v_el in array v_fields loop
    if not is_vocab_key('study_field', v_el) then raise exception 'invalid_vocab' using errcode = '22023', detail = 'study_field:' || v_el; end if;
  end loop;

  if v_neu then
    -- Die Sperre auf der Org-Edition reiht gleichzeitige Anlagen hintereinander, sonst ergäben zwei Klicks auf den zehnten Eintrag elf.
    perform 1 from org_edition where id = v_oe.id for update;
    select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe.id;
    if v_n >= v_max then raise exception 'too_many_hiring' using errcode = 'P0001', detail = v_max::text; end if;
    insert into org_hiring (org_edition_id, career_opportunity, function_area, role_text, skills, study_fields, published, created_by)
    values (v_oe.id, v_career, v_area, v_role, v_skills, v_fields, coalesce(p_published, false), current_person_id())
    returning id into v_id;
  else
    update org_hiring
       set career_opportunity = v_career, function_area = v_area, role_text = v_role, skills = v_skills, study_fields = v_fields,
           published = coalesce(p_published, false), updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;

  perform log_audit('partner.org_hiring', 'org_edition', v_oe.id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'hiring_id', v_id, 'neu', v_neu,
                                       'career_opportunity', v_career, 'function_area', v_area,
                                       'published', coalesce(p_published, false),
                                       'skills', cardinality(v_skills), 'study_fields', cardinality(v_fields)));
  return v_id;
end $$;

create or replace function delete_org_hiring(p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_row org_hiring; v_org uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_row from org_hiring where id = p_id for update;
  if not found then raise exception 'hiring_not_found' using errcode = 'P0002'; end if;
  select oe.org_id into v_org from org_edition oe where oe.id = v_row.org_edition_id;
  if v_org is null or not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from org_hiring where id = p_id;
  perform log_audit('partner.org_hiring_remove', 'org_edition', v_row.org_edition_id::text, null,
                    jsonb_build_object('org_id', v_org, 'hiring_id', p_id,
                                       'career_opportunity', v_row.career_opportunity, 'function_area', v_row.function_area));
end $$;

select harden_definer_functions();
