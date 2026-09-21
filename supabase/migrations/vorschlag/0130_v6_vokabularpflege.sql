-- =============================================================================
-- 0130 · Welle 6 · Vokabular vollständig pflegen (ADM-032)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- `/admin/vokabular` kann heute genau eine Sache: einen Begriff aktiv oder
-- inaktiv schalten. Anlegen, Umbenennen, Sortieren und Löschen gehen nur über
-- eine Migration — für einen Studiengang, der in der Liste fehlt, braucht es
-- einen Entwicklerlauf. Das ist der Grund für diesen Baustein.
--
-- **Löschen ist die gefährliche Operation, und deshalb die vorsichtigste.**
-- Ein Vokabularschlüssel steht nicht in einer Fremdschlüsselbeziehung: er liegt
-- als Text in fremden Spalten (`person.career_level`, `product.category`, …).
-- Die Datenbank kann ihn also klaglos löschen, und irgendwo im Portal steht
-- danach ein leeres Feld oder ein roher Schlüssel.
--
-- **Die Lösung ist ein Verzeichnis, kein Ratespiel.** `vocab_binding` sagt, in
-- welcher Spalte ein Vokabular benutzt wird. Gefüllt wird es aus zwei Quellen:
-- automatisch über gleichnamige Spalten in Basistabellen (33 Treffer, etwa
-- `person.career_level` zu `career_level`) und von Hand für die sieben Fälle,
-- in denen Spalte und Vokabular anders heissen.
--
-- **Ohne Eintrag wird nicht gelöscht.** Ein Vokabular, dessen Verwendung wir
-- nicht kennen, liefert P0001 `usage_unknown` statt eines Löschversuchs auf
-- gut Glück. Das ist streng, und es ist die richtige Richtung: ein Begriff, den
-- niemand löschen kann, kostet einen Klick auf „deaktivieren"; ein Begriff, der
-- zu Unrecht gelöscht wurde, kostet die Suche danach, warum ein Profil seit
-- Wochen ein leeres Feld hat.
--
-- **Deaktivieren bleibt immer erlaubt** und ist der empfohlene Weg: der Begriff
-- verschwindet aus jeder Auswahl, die bestehenden Daten behalten ihn.
--
-- Umbenennen meint die **Beschriftung**, nicht den Schlüssel. Ein Schlüssel ist
-- der Wert in fremden Spalten; ihn zu ändern hiesse, alle Daten mitzuziehen,
-- und das ist eine Migration und keine Pflegemaske.
--
-- Fehlerschlüssel: 42501 ohne Admin · 22023 `invalid_key` (Form) ·
-- 22023 `fields_required` · P0001 `in_use` (Detail: Anzahl und Spalte) ·
-- P0001 `usage_unknown` · P0001 `has_children` · P0002 `term_not_found`.
--
-- Test: supabase/tests/v6_vokabularpflege.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Verzeichnis

create table if not exists vocab_binding (
  vocabulary        text not null,
  table_name        text not null,
  column_name       text not null,
  -- Arrays (`volunteer_profile.areas`) brauchen `= any(...)` statt `=`.
  is_array          boolean not null default false,
  -- Tabellen wie `person_interest` fuehren mehrere Vokabulare nebeneinander und
  -- unterscheiden sie in einer eigenen Spalte.
  vocabulary_column text,
  note              text,
  primary key (vocabulary, table_name, column_name)
);
comment on table vocab_binding is
  'Wo ein Vokabular tatsaechlich benutzt wird (0130). Grundlage der Loeschsperre: ohne Eintrag wird ein Begriff nicht geloescht, weil niemand sagen kann, ob er in Gebrauch ist.';

alter table vocab_binding enable row level security;
revoke all on vocab_binding from anon, authenticated;
-- Kein Policy-Block: gelesen wird ausschliesslich ueber die Funktionen unten.

-- Automatisch: gleichnamige Spalte in einer Basistabelle.
insert into vocab_binding (vocabulary, table_name, column_name, note)
select distinct v.vocabulary, c.table_name, c.column_name, 'gleichnamige Spalte'
  from (select distinct vocabulary from vocab_term) v
  join information_schema.columns c
    on c.column_name = v.vocabulary and c.table_schema = 'public' and c.data_type = 'text'
  join information_schema.tables t
    on t.table_schema = 'public' and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
on conflict do nothing;

-- Von Hand: Spalte und Vokabular heissen verschieden. Jede dieser Zeilen ist
-- gegen die Daten geprueft (21.09.) — nicht geraten.
insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note)
values
  ('organization_type',   'organization',              'type',            false, null,         'organization.type'),
  ('product_category',    'product',                   'category',        false, null,         'product.category'),
  ('partner_format',      'product',                   'format_key',      false, null,         'product.format_key'),
  ('speaker_pipeline',    'speaker_profile',           'pipeline_status', false, null,         'speaker_profile.pipeline_status'),
  ('interests',           'person_interest',           'term_key',        false, 'vocabulary', 'mehrere Vokabulare je Tabelle'),
  ('interests_founder',   'person_interest',           'term_key',        false, 'vocabulary', 'mehrere Vokabulare je Tabelle'),
  ('acquisition_channel', 'person_acquisition_channel','term_key',        false, null,         'person_acquisition_channel.term_key')
on conflict do nothing;

-- ---------------------------------------------------------------- Zählen

/**
 * Wie oft wird dieser Begriff benutzt?
 *
 * `null` heisst **nicht** „null Mal", sondern „wir wissen es nicht" — für ein
 * Vokabular ohne Eintrag im Verzeichnis. Der Unterschied entscheidet darüber,
 * ob gelöscht werden darf, und deshalb sind es zwei verschiedene Werte und
 * nicht zweimal die Null.
 */
create or replace function vocab_term_usage(p_vocabulary text, p_key text)
returns integer
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; v_summe integer := 0; v_n integer; v_kennt boolean := false;
begin
  for r in select * from vocab_binding b where b.vocabulary = p_vocabulary loop
    v_kennt := true;
    -- `%I` fuer jeden Bezeichner: die Zeilen stammen zwar aus einer Migration
    -- und nicht aus einer Eingabe, aber eine dynamische Abfrage ohne
    -- Bezeichner-Quoting ist eine Gewohnheit, die man sich nicht angewoehnt.
    if r.is_array then
      execute format('select count(*)::integer from public.%I where $1 = any(%I)%s',
                     r.table_name, r.column_name,
                     case when r.vocabulary_column is null then ''
                          else format(' and %I = $2', r.vocabulary_column) end)
        into v_n using p_key, p_vocabulary;
    else
      execute format('select count(*)::integer from public.%I where %I = $1%s',
                     r.table_name, r.column_name,
                     case when r.vocabulary_column is null then ''
                          else format(' and %I = $2', r.vocabulary_column) end)
        into v_n using p_key, p_vocabulary;
    end if;
    v_summe := v_summe + coalesce(v_n, 0);
  end loop;
  if not v_kennt then return null; end if;
  return v_summe;
end $$;
revoke execute on function vocab_term_usage(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- Lesen

/** Das Vokabular mit Verwendungszahl — die Zahl entscheidet über den Löschknopf. */
create or replace function vocab_terms_admin(p_vocabulary text default null)
returns table (vocabulary text, key text, label_de text, label_en text,
               sort_order integer, active boolean, parent_vocabulary text, parent_key text,
               usage integer, kinder integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.vocabulary, t.key, t.label_de, t.label_en, t.sort_order, t.active,
           t.parent_vocabulary, t.parent_key,
           vocab_term_usage(t.vocabulary, t.key),
           (select count(*)::integer from vocab_term k
             where k.parent_vocabulary = t.vocabulary and k.parent_key = t.key)
      from vocab_term t
     where p_vocabulary is null or t.vocabulary = p_vocabulary
     order by t.vocabulary, t.sort_order, t.key;
end $$;
grant execute on function vocab_terms_admin(text) to authenticated;

-- ---------------------------------------------------------------- Schreiben

/**
 * Anlegen und ändern.
 *
 * Der Schlüssel ist beim Anlegen frei und danach fest: er steht als Wert in
 * fremden Spalten, und ihn zu ändern hiesse, alle Daten mitzuziehen. Geändert
 * werden Beschriftung, Reihenfolge, Aktivkennzeichen und die Elternzuordnung.
 */
create or replace function upsert_vocab_term(p_data jsonb) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_voc text; v_key text; v_vorher jsonb;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  v_voc := nullif(btrim(p_data->>'vocabulary'), '');
  v_key := nullif(btrim(p_data->>'key'), '');
  if v_voc is null or v_key is null then
    raise exception 'fields_required' using errcode = '22023', detail = 'vocabulary und key sind Pflicht';
  end if;
  -- Dieselbe Form, die `is_vocab_key` im Bestand voraussetzt: klein, ohne
  -- Leerzeichen. Ein Schluessel mit Umlaut oder Leerzeichen laesst sich spaeter
  -- nicht mehr sauber in eine URL oder einen Export schreiben.
  if v_key !~ '^[a-z][a-z0-9_]{0,60}$' then
    raise exception 'invalid_key' using errcode = '22023', detail = v_key;
  end if;
  if nullif(btrim(p_data->>'label_de'), '') is null or nullif(btrim(p_data->>'label_en'), '') is null then
    raise exception 'fields_required' using errcode = '22023', detail = 'label_de und label_en sind Pflicht';
  end if;

  select to_jsonb(t) into v_vorher from vocab_term t where t.vocabulary = v_voc and t.key = v_key;

  insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active,
                          parent_vocabulary, parent_key)
  values (v_voc, v_key, btrim(p_data->>'label_de'), btrim(p_data->>'label_en'),
          coalesce((p_data->>'sort_order')::integer, 0),
          coalesce((p_data->>'active')::boolean, true),
          nullif(btrim(p_data->>'parent_vocabulary'), ''), nullif(btrim(p_data->>'parent_key'), ''))
  on conflict (vocabulary, key) do update set
    label_de = excluded.label_de,
    label_en = excluded.label_en,
    sort_order = excluded.sort_order,
    active = excluded.active,
    parent_vocabulary = excluded.parent_vocabulary,
    parent_key = excluded.parent_key,
    updated_at = now();

  perform log_audit('vocab.upsert', 'vocab_term', v_voc || ':' || v_key, v_vorher, p_data);
  return v_key;
end $$;
grant execute on function upsert_vocab_term(jsonb) to authenticated;

/**
 * Löschen — nur, wenn niemand ihn benutzt.
 *
 * Drei Gründe, es nicht zu tun, und alle drei sagen, was zu tun wäre:
 * der Begriff ist in Gebrauch, er hat Unterbegriffe, oder wir wissen nicht, wo
 * er benutzt wird. Der letzte Fall ist der wichtigste: Schweigen ist hier kein
 * „nein, wird nicht benutzt".
 */
create or replace function delete_vocab_term(p_vocabulary text, p_key text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb; v_usage integer; v_kinder integer;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(t) into v_before from vocab_term t
   where t.vocabulary = p_vocabulary and t.key = p_key;
  if v_before is null then
    raise exception 'term_not_found' using errcode = 'P0002',
      detail = coalesce(p_vocabulary, '?') || ':' || coalesce(p_key, '?');
  end if;

  select count(*)::integer into v_kinder from vocab_term k
   where k.parent_vocabulary = p_vocabulary and k.parent_key = p_key;
  if v_kinder > 0 then
    raise exception 'has_children' using errcode = 'P0001', detail = v_kinder::text;
  end if;

  v_usage := vocab_term_usage(p_vocabulary, p_key);
  if v_usage is null then
    raise exception 'usage_unknown' using errcode = 'P0001', detail = p_vocabulary;
  end if;
  if v_usage > 0 then
    raise exception 'in_use' using errcode = 'P0001', detail = v_usage::text;
  end if;

  delete from vocab_term where vocabulary = p_vocabulary and key = p_key;
  perform log_audit('vocab.delete', 'vocab_term', p_vocabulary || ':' || p_key, v_before, null);
end $$;
grant execute on function delete_vocab_term(text, text) to authenticated;

select harden_definer_functions();
