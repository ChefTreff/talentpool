-- 0093 · Welle 5 · Selbst gemeldete Schritte je Partner-Edition (F9.8)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Die Event-App-Seite führt sechs Schritte auf, die in **Swapcard** passieren.
-- Wir sehen von aussen nicht, ob sie erledigt sind — es gibt keine Schnittstelle,
-- die uns das sagt. Deshalb war die Liste zunächst ohne Haken.
--
-- Konrad hat das am 14.09. entschieden: „Die Partner wissen ja, wann sie etwas
-- erledigt haben." Der Haken ist also eine **Selbstauskunft**, kein Nachweis —
-- und genau so wird er auch benannt. Er steht in der Datenbank, damit die
-- Produktion im Hintergrund sieht, wo eine Organisation hängt, statt in der
-- Woche vor dem Summit einzeln nachzufragen.
--
-- Zwei Tabellen, weil beides verschiedene Dinge sind:
--   `org_step`       — der **Katalog**: welche Schritte es zu einem Thema gibt.
--                      Gepflegt per Migration, denn der Wortlaut steht in der
--                      Oberfläche (DE/EN) und ein neuer Schritt braucht ohnehin
--                      beides.
--   `org_step_check` — das **Häkchen**: wer wann was als erledigt gemeldet hat.
--
-- Ohne den Katalog könnte jeder beliebige Schlüssel geschrieben werden und
-- „4 von 6" wäre geraten. Mit ihm ist die Gesamtzahl eine Zahl aus der
-- Datenbank, und die Produktionsauswertung stimmt auch dann noch, wenn jemand
-- an der Oberfläche vorbei schreibt.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- 22023 `invalid_step` (unbekanntes Thema oder unbekannter Schritt) ·
-- P0002 `org_edition_not_found`.

set search_path = public, extensions;

-- ---------------------------------------------------------------- Katalog

create table if not exists org_step (
  topic      text not null,
  key        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (topic, key),
  constraint org_step_topic_chk check (btrim(topic) <> ''),
  constraint org_step_key_chk check (btrim(key) <> '')
);

comment on table org_step is
  'Katalog der selbst zu meldenden Schritte je Thema (F9.8). Der Wortlaut steht in der Oberfläche, hier stehen nur Schlüssel und Reihenfolge — so ist „x von y" eine Zahl aus der Datenbank.';

alter table org_step enable row level security;
revoke all on org_step from anon, authenticated;
grant all on org_step to service_role;

insert into org_step (topic, key, sort_order) values
  ('event_app', 'profil',          1),
  ('event_app', 'team',            2),
  ('event_app', 'mitarbeitende',   3),
  ('event_app', 'leads_teilen',    4),
  ('event_app', 'stellen',         5),
  ('event_app', 'profile_suchen',  6)
on conflict (topic, key) do nothing;

-- ---------------------------------------------------------------- Häkchen

create table if not exists org_step_check (
  org_edition_id uuid not null references org_edition(id) on delete cascade,
  topic          text not null,
  key            text not null,
  done_at        timestamptz not null default now(),
  done_by        uuid references person(id) on delete set null,
  primary key (org_edition_id, topic, key),
  foreign key (topic, key) references org_step (topic, key) on delete cascade
);

comment on table org_step_check is
  'Selbstauskunft: dieser Schritt ist erledigt. Kein Nachweis — was in Swapcard passiert, sehen wir nicht. Zeile da = erledigt, Zeile weg = offen.';

create index if not exists org_step_check_topic_idx on org_step_check (topic, key);

alter table org_step_check enable row level security;
revoke all on org_step_check from anon, authenticated;
grant all on org_step_check to service_role;

-- ---------------------------------------------------------------- Lesen

/**
 * Die Schritte eines Themas für **eine** Organisation, mit Stand.
 *
 * Gibt den ganzen Katalog zurück, nicht nur das Abgehakte: die Seite soll
 * sechs Zeilen zeigen, auch wenn keine einzige angehakt ist.
 */
create or replace function my_org_steps(p_org_id uuid, p_topic text, p_edition_id uuid default null)
returns table (key text, sort_order integer, done_at timestamptz, done_by_name text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_id::text;
  end if;
  return query
    select s.key, s.sort_order, c.done_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from org_step s
      left join org_step_check c
        on c.topic = s.topic and c.key = s.key and c.org_edition_id = v_oe.id
      left join person p on p.id = c.done_by
     where s.topic = p_topic
     order by s.sort_order, s.key;
end $$;

/**
 * Für die Produktion: wie weit ist jede Organisation dieser Edition?
 *
 * Bewusst als Zahlenpaar und nicht als Liste einzelner Häkchen — die Frage im
 * Alltag lautet „wer hängt?", nicht „wer hat Schritt 3".
 */
create or replace function org_steps_progress(p_topic text, p_edition_id uuid default null)
returns table (org_id uuid, org_name text, done integer, total integer, last_done_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid; v_total integer;
begin
  if not (is_partner_team() or is_production_team() or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  select count(*)::integer into v_total from org_step s where s.topic = p_topic;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name),
           count(c.key)::integer, v_total, max(c.done_at)
      from org_edition oe
      join organization o on o.id = oe.org_id
      left join org_step_check c on c.org_edition_id = oe.id and c.topic = p_topic
     where oe.edition_id = v_ed
     group by o.id, coalesce(o.communication_name, o.legal_name)
     order by count(c.key), coalesce(o.communication_name, o.legal_name);
end $$;

-- ---------------------------------------------------------------- Schreiben

/**
 * Haken setzen oder wegnehmen.
 *
 * `p_done = false` löscht die Zeile statt sie auf „nicht erledigt" zu setzen:
 * offen ist der Normalfall und braucht keine Zeile. Das Setzen ist idempotent —
 * zweimal klicken auf demselben Stand ändert nichts, auch nicht den Zeitpunkt.
 */
create or replace function set_org_step(
  p_org_id uuid, p_topic text, p_key text, p_done boolean, p_edition_id uuid default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from org_step s where s.topic = p_topic and s.key = p_key) then
    raise exception 'invalid_step' using errcode = '22023', detail = p_topic || '/' || p_key;
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_id::text;
  end if;

  if p_done then
    insert into org_step_check (org_edition_id, topic, key, done_by)
    values (v_oe.id, p_topic, p_key, current_person_id())
    -- Nichts tun, nicht überschreiben: sonst wanderte der Zeitpunkt bei jedem
    -- erneuten Laden nach vorn und die Auswertung wüsste nicht mehr, wann es
    -- wirklich passiert ist.
    on conflict (org_edition_id, topic, key) do nothing;
  else
    delete from org_step_check
     where org_edition_id = v_oe.id and topic = p_topic and key = p_key;
  end if;

  perform log_audit('org_step.set', 'org_edition', v_oe.id::text, null,
                    jsonb_build_object('topic', p_topic, 'key', p_key, 'done', p_done));
end $$;

select harden_definer_functions();
