-- 0295 · Side Events je Speaker lesen: speaker_side_events (ADM-087)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009080908.
-- Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: Auslegung H aus dem Review von #364 (Side Events) — der Block „Side Events“ je Speaker im Admin-Detail (`/admin/speaker/[id]`) und im
-- Personen-Fenster der Leads zeigt, wozu eine Person eingeladen ist und wie sie geantwortet hat; heute steht das nur je Event unter
-- `/admin/side-events`. Datenmodell vorab mit Plan abgestimmt (08.10.2026, „enge Fassung“): **eine** neue Lesefunktion — keine Tabelle, keine
-- Spalte, kein Schreibweg (Einladen und Stand setzen bleiben `invite_to_side_event` und `set_side_event_status` unter `/admin/side-events`).
--
-- Was `speaker_side_events(p_profile_id)` liefert: je Einladung des Profils **eine Zeile** — das Event (`side_event_id`, Titel DE/EN, Ort,
-- Beginn, Ende, `published`) und die Einladung (`status` invited/yes/no, `guests` nur als Zahl, `via`, `invited_at`, `mailed_at`,
-- `responded_at`), nach Beginn sortiert. Auch Events, die inzwischen nicht mehr veröffentlicht sind: das Team soll sehen, dass die Einladung noch
-- steht (`published = false`, die Oberfläche kennzeichnet es); der Speaker sieht sie über `my_side_events` dann nicht. Nur Events der Edition des
-- Profils.
--
-- Was sie bewusst **nicht** liefert: `note` (der Freitext des Speakers kann Unverträglichkeiten nennen — Art. 9 DSGVO; er steht nur im
-- aufgeklappten Event unter `/admin/side-events` und geht mit „Profil löschen“ weg) und `token_hash` (nie nach außen). Der Test hält die
-- Spaltenliste fest.
--
-- Rechte: `is_speaker_team(Edition des Profils)` — dieselbe Grenze wie `side_events_admin` (Admin, Bereichsleitung Speaker, Programm-Team).
-- **Enger** als `can_manage_speaker`: Stage Leads — auch die, die den Speaker betreuen — bekommen 42501, ebenso Partner, Assistenz und der
-- Speaker selbst (der sieht seine Einladungen über `my_side_events`, mit seinem Hinweis). Das Recht wird **vor** der Suche des Profils
-- geprüft: wer nicht zum Team gehört, erfährt nicht, ob es die Profil-Id gibt.
--
-- Fehlerschlüssel: 28000 `not authenticated` · 42501 `not allowed` · P0002 `speaker_not_found` (nur für das Team).
--
-- Basis: neue Funktion (kein `create or replace` einer bestehenden); Muster und Grenze von `side_events_admin` (Snapshot nach 0282).
set search_path = public, extensions;

create or replace function speaker_side_events(p_profile_id uuid)
 returns table(side_event_id uuid, title_de text, title_en text, location text, starts_at timestamptz, ends_at timestamptz,
               published boolean, status text, guests integer, via text, invited_at timestamptz, mailed_at timestamptz,
               responded_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'extensions' as $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = p_profile_id;
  if not coalesce(is_speaker_team(v_ed), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_ed is null then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  return query
    select e.id, e.title_de, e.title_en, e.location, e.starts_at, e.ends_at, e.published,
           i.status, i.guests, i.via, i.invited_at, i.mailed_at, i.responded_at
      from side_event_invite i
      join side_event e on e.id = i.side_event_id
     where i.profile_id = p_profile_id
       and e.edition_id = v_ed
     order by e.starts_at, e.id;
end $$;
comment on function speaker_side_events(uuid) is
  'ADM-087: die Side-Event-Einladungen eines Speaker-Profils für das Speaker-Team (Admin, Bereichsleitung Speaker, Programm-Team) — Event, Stand, Begleitung als Zahl, Weg und Zeitpunkte; ohne Hinweis und Token. Nur lesend, auch nicht veröffentlichte Events (published = false).';

select harden_definer_functions();
