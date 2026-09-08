-- =============================================================================
-- 0013 · Fix: mail_template.body_md enthielt die Zeichenfolge "\n" statt echter
--   Zeilenumbrüche (Seed 0011 nutzte Standard-Strings statt E'…'). Befund aus dem
--   Review von PR #1 (Build-Session). Seed-Datei 0011 ist ebenfalls korrigiert.
-- =============================================================================
set search_path = public, extensions;

update mail_template
   set body_md = replace(body_md, '\n', E'\n')
 where body_md like '%\\n%';

select harden_definer_functions();
