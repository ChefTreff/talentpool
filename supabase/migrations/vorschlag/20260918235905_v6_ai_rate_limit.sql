-- 0126 · Welle 6 · Zähler für Assistenten ausserhalb der Wissensbasis (SPK-012)
--
-- Vorschlag der Build-Session Speaker-Domäne. Anwenden, Umbenennen und der
-- Eintrag ins Entscheidungslog gehören der Architektur-/Security-Session.
-- Nummer 0126 zugeteilt.
--
-- Anlass: Der Titel-Assistent (S6) braucht dieselbe Bremse wie der
-- Wiki-Assistent — eine Obergrenze je Person und Stunde, in der Datenbank
-- gezählt. Im Speicher der Instanz gezählt wäre es kein Limit: jede
-- Vercel-Region hätte ihren eigenen Zähler (Begründung aus 0108).
--
-- **Warum eine eigene Tabelle und nicht `kb_rate_limit`:**
--   * Die vorhandene Tabelle hat keinen Platz für die Art des Aufrufs; ihr
--     Schlüssel ist `(auth_user_id, window_start)`. Eine Spalte dazu hiesse,
--     den Primärschlüssel einer **laufenden** Tabelle zu ändern.
--   * Und ein gemeinsamer Topf wäre fachlich falsch: wer zwanzig Fragen ans
--     Wiki stellt, hätte damit den Titel-Assistenten verbraucht. Das sind zwei
--     Aufgaben, keine.
-- `kb_rate_limit` und `kb_take_question_slot` bleiben deshalb unangetastet.
-- Wer später mag, kann die Wissensbasis auf diese Tabelle umstellen — dann
-- gehört das in eine eigene Migration mit eigenem Test.
--
-- Fehlerschlüssel: 28000 · 22023 `invalid_kind` · P0001 `rate_limited`
-- (detail = Obergrenze).

set search_path = public, extensions;

create table if not exists ai_rate_limit (
  auth_user_id uuid not null,
  -- Die Art des Assistenten. Als Text und nicht als Vokabular: der Wert steht
  -- im Code der Route, nicht in einer Auswahlliste für Menschen.
  kind         text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (auth_user_id, kind, window_start)
);

comment on table ai_rate_limit is
  'Aufrufzähler je Person, Assistent und Stunde (0126). Bremse für Modellaufrufe; wird vom Housekeeping aufgeräumt. Kein Inhalt, keine Frage — nur Zahlen.';

alter table ai_rate_limit enable row level security;
revoke all on ai_rate_limit from anon, authenticated;

create index if not exists ai_rate_limit_window_idx on ai_rate_limit (window_start);

/**
 * Einen Aufruf verbuchen — oder abweisen.
 *
 * Zählt **vor** dem Modellaufruf. Wer erst danach zählt, hat die Kosten schon,
 * wenn die Bremse greift.
 */
create or replace function ai_take_slot(p_kind text, p_limit integer default 20)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_win timestamptz; v_hits integer; v_kind text;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '28000'; end if;
  v_kind := nullif(btrim(p_kind), '');
  if v_kind is null or length(v_kind) > 40 then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(p_kind, 'null');
  end if;

  v_win := date_trunc('hour', now());
  insert into ai_rate_limit (auth_user_id, kind, window_start, hits)
  values (v_uid, v_kind, v_win, 1)
  on conflict (auth_user_id, kind, window_start)
    do update set hits = ai_rate_limit.hits + 1
  returning hits into v_hits;

  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_limit::text;
  end if;
  return jsonb_build_object('used', v_hits, 'left', greatest(0, p_limit - v_hits));
end $$;

comment on function ai_take_slot(text, integer) is
  'Verbucht einen Assistenten-Aufruf je Person, Art und Stunde und weist über der Grenze mit P0001 rate_limited ab. Vor dem Modellaufruf zu rufen.';

/**
 * Aufräumen.
 *
 * Zählerzeilen älter als 24 Stunden sind bedeutungslos — das Fenster ist eine
 * Stunde. Hängt im bestehenden Housekeeping, damit niemand daran denken muss.
 */
create or replace function purge_ai_rate_limit() returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  if auth.uid() is not null and not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from ai_rate_limit where window_start < now() - interval '24 hours';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function purge_ai_rate_limit() from public, anon, authenticated;

select harden_definer_functions();
