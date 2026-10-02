-- 00NN · Sechster Tour-Typ „Marketing": Vokabular company_tour_type ergänzen und die Marketing-Tour typisieren (K-52, Nachtrag zu 0248 / ADM-045)
--
-- Anlass: Konrad (02.10.2026, K-52): **sechs** Tour-Typen, Marketing aktiv. 0248 legte
-- das Vokabular nach der Liste vom 22.09. mit fünf Typen an und ließ die Tour
-- „Marketing" aus 0134 bewusst ohne Typ (Konrad 18.09.: sechs Touren — Finance,
-- Consulting, Marketing, Logistik, Engineering, Sales; „nicht geraten").
--
-- Umsetzung (nur Daten, keine Funktion ändert sich — `ensure_company_tours`,
-- `tour_assignment_admin` und `set_company_tour_type` lesen das Vokabular zur Laufzeit):
--   * Vokabular `company_tour_type`: `marketing` (DE „Marketing", EN „Marketing"),
--     Reihenfolge alphabetisch wie bei den übrigen Typen, deshalb rückt Sales von 50 auf 60.
--   * Bestand: jede Tour namens „Marketing" ohne Typ bekommt den Typ `marketing` —
--     je Edition höchstens eine (der Unique-Index `company_tour_type_uidx` erlaubt
--     einen Typ nur einmal je Edition; eine zweite gleichnamige Tour bliebe ohne Typ
--     und fiele im Admin auf, statt die Migration zu brechen).
--   * Editionen ohne Marketing-Tour bekommen sie beim nächsten „Touren anlegen"
--     (`ensure_company_tours`) mit drei Stopps.
-- Idempotent: ein zweiter Lauf ändert nichts.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('company_tour_type', 'marketing', 'Marketing', 'Marketing', 50, true)
on conflict (vocabulary, key) do nothing;

update vocab_term set sort_order = 60
 where vocabulary = 'company_tour_type' and key = 'sales' and sort_order = 50;

update company_tour t set tour_type = 'marketing'
 where t.id in (
   select distinct on (c.edition_id) c.id
     from company_tour c
    where lower(btrim(c.name)) = 'marketing' and c.tour_type is null
      and not exists (select 1 from company_tour x where x.edition_id = c.edition_id and x.tour_type = 'marketing')
    order by c.edition_id, c.created_at, c.id
 );

select harden_definer_functions();
