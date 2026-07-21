-- =============================================================================
-- 0002 · Primäre-E-Mail-Invariante — jede Person hat GENAU eine primäre E-Mail
--   (a) höchstens eine primäre: partieller Unique-Index
--   (b) mindestens eine primäre: DEFERRABLE Constraint-Trigger (Prüfung bei COMMIT)
-- "genau eine primär" impliziert "mindestens eine E-Mail".
-- =============================================================================
set search_path = public, extensions;

-- (a) höchstens eine primäre E-Mail je Person
create unique index person_email_single_primary
  on person_email (person_id) where is_primary;

-- (b) genau eine primäre E-Mail — deferred, damit `insert person; insert email;`
--     in einer Transaktion erlaubt ist (Check erst bei COMMIT).
create or replace function enforce_primary_email() returns trigger
language plpgsql as $$
declare
  pids uuid[];
  pid  uuid;
  n    int;
begin
  if tg_table_name = 'person' then
    pids := array[new.id];
  else
    -- person_email: bei Reparenting (Merge) OLD und NEW person prüfen
    pids := array(
      select distinct x from unnest(array[
        case when tg_op <> 'INSERT' then old.person_id end,
        case when tg_op <> 'DELETE' then new.person_id end
      ]) as x where x is not null
    );
  end if;

  foreach pid in array pids loop
    if exists (select 1 from person where id = pid) then  -- gelöschte Person überspringen
      select count(*) into n from person_email
        where person_id = pid and is_primary;
      if n <> 1 then
        raise exception 'person % muss genau eine primäre E-Mail haben (gefunden: %)', pid, n
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
  return null;
end $$;

create constraint trigger trg_person_primary_email
  after insert on person
  deferrable initially deferred for each row
  execute function enforce_primary_email();

create constraint trigger trg_person_email_primary
  after insert or update or delete on person_email
  deferrable initially deferred for each row
  execute function enforce_primary_email();

-- Hinweis (Bulk-Import, P3): Trigger via `alter table ... disable trigger` aussetzen,
-- laden, dann prüfen:
--   select person_id from person_email group by person_id
--   having count(*) filter (where is_primary) <> 1;
-- Danach Trigger reaktivieren. Derselbe Query eignet sich als nächtlicher Integritäts-Check.
