-- 00NN · SPK-047: Bucket `speaker-photos` privat (Security-Check F2)
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- 0136 (`v6_ea2_speaker_eventapp`) legte `speaker-photos` öffentlich an, damit
-- Swapcard das Profilfoto über eine frei abrufbare Adresse holt. Der
-- Security-Check (F2) fand: jede Kopie ist ohne Anmeldung lesbar, solange man
-- die Adresse kennt, und bei Absage blieb sie liegen. Entscheidung (Plan-Chat
-- 25.09., keine K-Frage): privat; Swapcard bekommt befristete signierte
-- Adressen (7 Tage).
--
-- Die Anwendung (`lib/event-app/logos.ts`) signiert mit `service_role` und
-- räumt bei jedem Echtlauf Kopien weg, die zu keinem Speaker in der App mehr
-- gehören (Absage, neue Fassung, gelöschtes Profil). Stand beim Schreiben
-- (25.09.2026): 0 Kopien im Bucket, noch kein Speaker-Lauf gegen live — das
-- Umstellen bricht also nichts. Policies für anon oder authenticated gab und
-- gibt es auf dem Bucket keine; `partner-logos` bleibt öffentlich (0057).

set search_path = public, extensions;

update storage.buckets set public = false where id = 'speaker-photos';

select harden_definer_functions();
