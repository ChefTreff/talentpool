-- 0100 · Welle 5 · Ernährung und Catering (Abgleich 15.09., Punkt 2)
--
-- Angewendet von der Architektur-Session am 15.09.2026 nach Review.
--
-- Zwei Angaben, aus zwei Gründen getrennt:
--
-- 1. **Ernährungsform** als Auswahl (`diet`) — das ist die Zahl, mit der beim
--    Caterer bestellt wird: „40 vegetarisch, 12 vegan".
-- 2. **Unverträglichkeiten** als Freitext (`diet_note`) — das ist der Satz, den
--    die Küche liest: „Nussallergie", „kein Sellerie". Eine Auswahlliste wäre
--    hier falsch; Allergien sind keine Kategorien, und eine unvollständige
--    Liste lädt dazu ein, das Falsche anzuklicken.
--
-- ⚠️ **Der Freitext kann eine Gesundheitsangabe sein (Art. 9 DSGVO).** Deshalb:
--   · Die Angabe ist **freiwillig** und wird in der Oberfläche so benannt.
--   · Es gibt **keine** RPC, die Name und Angabe zusammen herausgibt. Weder die
--     Produktion noch der Admin-Bereich sehen, von wem ein Hinweis stammt —
--     `catering_summary` zählt, `catering_notes` gibt Sätze ohne Person.
--     Wer selbst betroffen ist, sieht die eigene Angabe im eigenen Portal.
--   · Restrisiko, das bleibt und benannt gehört: ein sehr spezieller Hinweis
--     in einer kleinen Gruppe ist mittelbar zuordenbar. Dagegen hilft keine
--     Technik, nur Sparsamkeit — deshalb steht im Formular, dass eine kurze
--     Angabe reicht.
--   · Gelöscht wird mit der Person (`on delete cascade` über `person`); eine
--     eigene Frist je Edition wäre die nächste Stufe, wenn ihr sie wollt.
--
-- Die Felder hängen an `person`, nicht am Speaker-Profil: Volunteers essen
-- auch, und niemand will dieselbe Angabe zweimal machen.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht · 22023 `invalid_diet`.

set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('diet', 'alles',        'Alles',            'No restriction',  1, true),
  ('diet', 'vegetarisch',  'Vegetarisch',      'Vegetarian',      2, true),
  ('diet', 'vegan',        'Vegan',            'Vegan',           3, true),
  ('diet', 'pescetarisch', 'Pescetarisch',     'Pescetarian',     4, true),
  ('diet', 'halal',        'Halal',            'Halal',           5, true),
  ('diet', 'koscher',      'Koscher',          'Kosher',          6, true)
on conflict (vocabulary, key) do nothing;

alter table person add column if not exists diet text;
alter table person add column if not exists diet_note text;

comment on column person.diet is
  'Ernährungsform aus dem Vokabular `diet`. Grundlage der Catering-Bestellung. NULL = keine Angabe.';
comment on column person.diet_note is
  'Unverträglichkeiten und Allergien, Freitext, freiwillig. Kann eine Gesundheitsangabe nach Art. 9 DSGVO sein — wird nie zusammen mit dem Namen herausgegeben.';

-- ------------------------------------------------- Eintragen

/** Die eigene Angabe. */
create or replace function my_diet() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('diet', p.diet, 'diet_note', p.diet_note)
    from person p where p.id = current_person_id()
$$;

/**
 * Ernährung eintragen — **nur für sich selbst**.
 *
 * Die Assistenz darf Hotel, Shuttle und Anreise pflegen, diese Angabe nicht.
 * Der Grund ist nicht Formalismus, sondern Sicherheit: sie könnte die Angabe
 * nicht lesen (es gibt keine RPC, die sie zu einer fremden Person herausgibt),
 * würde also ein leeres Formular sehen und beim Speichern eine hinterlegte
 * Allergie löschen. Am Ende steht jemand mit der falschen Mahlzeit da.
 *
 * Wenn die Assistenz es später doch eintragen soll, braucht es einen Entwurf,
 * der beides löst — sehen und überschreiben —, nicht einen zweiten Parameter.
 */
create or replace function set_diet(p_diet text, p_note text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_ziel uuid; v_diet text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ziel := v_me;

  v_diet := nullif(btrim(coalesce(p_diet, '')), '');
  if v_diet is not null and not is_vocab_key('diet', v_diet) then
    raise exception 'invalid_diet' using errcode = '22023', detail = v_diet;
  end if;

  update person set
    diet = v_diet,
    -- Kurz halten ist Datensparsamkeit, nicht Bequemlichkeit.
    diet_note = left(nullif(btrim(coalesce(p_note, '')), ''), 300)
   where id = v_ziel;

  -- **Ohne Werte im Protokoll.** Ein Audit-Log, das die Allergie mitschreibt,
  -- hebt genau den Schutz auf, den die RPCs darüber aufbauen.
  perform log_audit('person.diet', 'person', v_ziel::text, null, null);
end $$;

-- ------------------------------------------------- Auswerten (ohne Namen)

/**
 * Wer zählt zum Catering und zu welcher Gruppe?
 *
 * Speaker mit Zusage und angenommene Volunteers — also die, die wirklich da
 * sind. Bewerbungen und Absagen zählen nicht mit, sonst bestellt man für
 * Leute, die nicht kommen.
 */
create or replace function catering_people(p_edition_id uuid)
returns table (person_id uuid, audience text)
language sql stable security definer set search_path = public, extensions as $$
  select sp.person_id, 'speaker'
    from speaker_profile sp join person p on p.id = sp.person_id and p.deleted_at is null
   where sp.edition_id = p_edition_id and speaker_is_confirmed(sp.pipeline_status)
  union
  select vp.person_id, 'volunteer'
    from volunteer_profile vp join person p on p.id = vp.person_id and p.deleted_at is null
   where vp.edition_id = p_edition_id and vp.status = 'accepted'
$$;
revoke execute on function catering_people(uuid) from public, anon, authenticated;

/**
 * Die Bestellgrundlage: Zahlen je Gruppe und Ernährungsform.
 *
 * `keine_angabe` steht ausdrücklich mit da — wer bestellt, muss wissen, für
 * wie viele Menschen er nichts weiss.
 */
create or replace function catering_summary(p_edition_id uuid default null)
returns table (audience text, diet text, anzahl integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not (is_production_team() or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select c.audience, coalesce(p.diet, 'keine_angabe'), count(*)::integer
      from catering_people(v_ed) c join person p on p.id = c.person_id
     group by c.audience, coalesce(p.diet, 'keine_angabe')
     order by c.audience, coalesce(p.diet, 'keine_angabe');
end $$;

/**
 * Die Hinweise für die Küche — **ohne Person**.
 *
 * Es gibt bewusst keine Spalte, über die sich ein Satz einem Namen zuordnen
 * liesse. Sortiert wird nach Gruppe und Text, nicht nach irgendeiner Reihung,
 * die die Zuordnung verraten würde.
 */
create or replace function catering_notes(p_edition_id uuid default null)
returns table (audience text, diet text, note text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not (is_production_team() or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select c.audience, coalesce(p.diet, 'keine_angabe'), p.diet_note
      from catering_people(v_ed) c join person p on p.id = c.person_id
     where nullif(btrim(coalesce(p.diet_note, '')), '') is not null
     order by c.audience, p.diet_note;
end $$;

/**
 * Wie vollständig ist die Antwort? Eine Steuerungszahl für den Admin-Bereich:
 * „38 von 52 Speakern haben geantwortet" sagt, ob man noch erinnern muss.
 */
create or replace function catering_coverage(p_edition_id uuid default null)
returns table (audience text, gesamt integer, mit_angabe integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not (is_production_team() or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select c.audience, count(*)::integer, count(p.diet)::integer
      from catering_people(v_ed) c join person p on p.id = c.person_id
     group by c.audience
     order by c.audience;
end $$;

-- ------------------------------------------------- Löschen nach der Edition

/**
 * Ernährungsangaben verfallen **30 Tage nach dem Ende der Edition**
 * (Entscheidung Architektur-Session, 15.09.).
 *
 * Gelöscht wird, wer **keine** Edition mehr hat, die noch läuft oder deren
 * Ende weniger als 30 Tage her ist. Wer für FLS27 zugesagt hat, behält die
 * Angabe also auch dann, wenn er bei FLS26 dabei war — es zählt die jüngste
 * Zugehörigkeit, nicht die älteste.
 *
 * Wer eine Angabe hat, aber zu gar keiner Edition gehört, wird beim nächsten
 * Lauf geräumt. Das kann nur passieren, wenn die Angabe an der Oberfläche
 * vorbei entstanden ist — dort taucht das Feld erst nach Zusage bzw. Annahme
 * auf.
 *
 * Idempotent: ein zweiter Lauf findet nichts mehr und meldet 0.
 */
create or replace function purge_diet_data(p_days integer default 30) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  -- Wie das übrige Housekeeping: aus dem Cron (ohne JWT) oder von Hand durch
  -- Admin/Programm-Team.
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update person p
     set diet = null, diet_note = null
   where (p.diet is not null or p.diet_note is not null)
     and not exists (
       select 1
         from (select sp.person_id, sp.edition_id from speaker_profile sp
               union all
               select vp.person_id, vp.edition_id from volunteer_profile vp) x
         join event e on e.id = x.edition_id
        where x.person_id = p.id
          and (e.end_date is null or e.end_date > current_date - p_days));
  get diagnostics v_n = row_count;

  -- Ohne Werte, wie überall bei dieser Angabe: die Zahl reicht als Nachweis,
  -- dass gelöscht wurde.
  if v_n > 0 then
    perform log_audit('person.diet_purged', 'system', 'housekeeping', null,
                      jsonb_build_object('count', v_n, 'days', p_days));
  end if;
  return v_n;
end $$;

/**
 * Housekeeping mit dem neuen Schritt. Der Rumpf ist unverändert aus 0075 —
 * dazugekommen ist `purge_diet_data()` und der Zähler in der Rückgabe.
 */
create or replace function run_application_housekeeping() returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_expired integer; v_promoted integer := 0; v_reminders integer; v_free integer; v_n integer;
        r record; v_partner jsonb; v_volunteers jsonb; v_diet integer;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_expired := expire_overdue_applications();
  for r in
    select s.id, s.capacity
    from session s
    where s.access_mode = 'application' and s.capacity is not null
      and exists (select 1 from decision_release d where d.session_id = s.id)
      and exists (select 1 from application a where a.session_id = s.id and a.status = 'waitlisted')
  loop
    select r.capacity - count(*) into v_free
      from application a where a.session_id = r.id and a.status in ('accepted', 'promoted', 'confirmed');
    if v_free > 0 then
      v_n := promote_waitlist(r.id, v_free);
      v_promoted := v_promoted + coalesce(v_n, 0);
    end if;
  end loop;
  v_reminders := send_presentation_reminders();
  v_partner := run_partner_housekeeping();
  v_volunteers := run_volunteer_housekeeping();
  v_diet := purge_diet_data();
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'reminders', v_reminders,
                            'partner', v_partner, 'volunteers', v_volunteers, 'diet_purged', v_diet);
end $$;

select harden_definer_functions();
