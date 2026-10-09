-- Test zu `v6_wiki_zwischenueberschriften` (PART-104 Teil 2, Redaktion). Belegt:
--   01 die Hilfsfunktion, Fall für Fall: eine fette Zeile wird `### …` (Wortlaut, Nummern, Klammern und Doppelpunkte im Text bleiben); ein Doppelpunkt am
--      Ende fällt weg (innen, außen, mit Leerzeichen); ein fetter Satz mit Punkt oder Ausrufezeichen bleibt fett; eine Zeile, die nach dem Entfetten leer wäre, bleibt;
--      Fett mitten im Text, zwei Fettstücke in einer Zeile, Liste, Zitat, Überschrift, Tabellenzeile und eingerückte Zeile bleiben, wie sie sind;
--      mehrzeilig, mit Wagenrücklauf (CRLF), leer und NULL; zweimal angewendet ändert nichts;
--   02 gegen den Bestand: keine Zeile in `kb_article.body_md` und `kb_chunk.body` ist noch eine fette Überschrift (die Suche des Assistenten ist neu zerlegt);
--      was an fetten Zeilen bleibt, sind fette Sätze mit Punkt (Information);
--   03 Zählprobe je Artikelpaar DE/EN: Zahl der `###`-Zeilen je Fassung und Abweichungen je Paar (Information — die englischen Entwürfe sind eigene Fassungen);
--   04 Idempotenz: ein zweiter Lauf der Funktion über alle Artikel ändert 0 Zeilen;
--   05 Rechte: die Hilfsfunktion ist für anon und authenticated nicht ausführbar.
-- Dass `updated_at` stehen bleibt, prüft die Migration selbst (sie bricht sonst ab).
-- Probelauf 09.10.2026 gegen den Bestand (64 Artikel, 52 fette Zeilen: 26 deutsche, 26 englische Entwürfe): 50 Zeilen in 18 Artikeln geändert (je 25 deutsche und englische, neun Artikel je Sprache); danach 25 `###`-Zeilen je Sprache, 32 Paare, 0 abweichend; übrig bleiben zwei fette Sätze im Artikel `pfand` (deutsch und englisch); alle Schritte `ok`, „PROBELAUF OK — alles zurückgerollt“.
begin;
create temp table t_res (step text, result text) on commit drop;
create function pg_temp.f_vergleich(p_schritt text, p_ist text, p_soll text) returns void
language plpgsql as $f$
begin
  insert into t_res values (p_schritt, case when p_ist is not distinct from p_soll then 'ok'
                                            else 'FEHLER ist=' || coalesce(p_ist, 'NULL') || ' soll=' || coalesce(p_soll, 'NULL') end);
end
$f$;
do $$
declare
  v_n integer; v_m integer; v_paare integer; v_de integer; v_en integer; v_abw integer; v_txt text; v_mehr text;
  v_mehrzeilig constant text := E'Einleitung\n\n**A**\nText\n\n**B**:\n';
begin
  -- 01 · die Hilfsfunktion
  perform pg_temp.f_vergleich('01a_ueberschrift', wiki_fette_zeilen_zu_ueberschriften('**Schritt 1: Code eingeben und Ticket einlösen**'), '### Schritt 1: Code eingeben und Ticket einlösen');
  perform pg_temp.f_vergleich('01b_doppelpunkt_innen', wiki_fette_zeilen_zu_ueberschriften('**Adresse:**'), '### Adresse');
  perform pg_temp.f_vergleich('01c_doppelpunkt_aussen', wiki_fette_zeilen_zu_ueberschriften('**Adresse**:'), '### Adresse');
  perform pg_temp.f_vergleich('01d_doppelpunkt_leerzeichen', wiki_fette_zeilen_zu_ueberschriften('**Adresse :**  '), '### Adresse');
  perform pg_temp.f_vergleich('01e_frage', wiki_fette_zeilen_zu_ueberschriften('**Ihr kommt mit Transporter oder LKW?**'), '### Ihr kommt mit Transporter oder LKW?');
  perform pg_temp.f_vergleich('01f_nummer_klammer_doppelpunkt_im_text', wiki_fette_zeilen_zu_ueberschriften('**Beispiel 3: Next-Level Productivity (Teil 2)**'), '### Beispiel 3: Next-Level Productivity (Teil 2)');
  perform pg_temp.f_vergleich('01g_a_klammer', wiki_fette_zeilen_zu_ueberschriften('**A) Offizielle Getränkepartner**'), '### A) Offizielle Getränkepartner');
  perform pg_temp.f_vergleich('01h_umlaute_und_zeichen', wiki_fette_zeilen_zu_ueberschriften('**Größe & Maße für Druckdaten – Beschnitt**'), '### Größe & Maße für Druckdaten – Beschnitt');
  perform pg_temp.f_vergleich('01i_satz_mit_punkt', wiki_fette_zeilen_zu_ueberschriften('**Wichtig: Ohne Chip kein Pfand zurück.**'), '**Wichtig: Ohne Chip kein Pfand zurück.**');
  perform pg_temp.f_vergleich('01j_satz_mit_ausrufezeichen', wiki_fette_zeilen_zu_ueberschriften('**Achtung!**'), '**Achtung!**');
  perform pg_temp.f_vergleich('01k_satz_mit_punkt_und_doppelpunkt', wiki_fette_zeilen_zu_ueberschriften('**Wichtig.**:'), '**Wichtig.**:');
  perform pg_temp.f_vergleich('01l_leer_nach_dem_entfetten', wiki_fette_zeilen_zu_ueberschriften('**   **'), '**   **');
  perform pg_temp.f_vergleich('01m_nur_doppelpunkt', wiki_fette_zeilen_zu_ueberschriften('**:**'), '**:**');
  perform pg_temp.f_vergleich('01n_vier_sterne', wiki_fette_zeilen_zu_ueberschriften('****'), '****');
  perform pg_temp.f_vergleich('01o_fett_mitten_im_text', wiki_fette_zeilen_zu_ueberschriften('Das ist **wichtig** hier'), 'Das ist **wichtig** hier');
  perform pg_temp.f_vergleich('01p_zwei_fettstuecke', wiki_fette_zeilen_zu_ueberschriften('**a** und **b**'), '**a** und **b**');
  perform pg_temp.f_vergleich('01q_stern_im_fett', wiki_fette_zeilen_zu_ueberschriften('**a*b**'), '**a*b**');
  perform pg_temp.f_vergleich('01r_liste_strich', wiki_fette_zeilen_zu_ueberschriften('- **Fett** in der Liste'), '- **Fett** in der Liste');
  perform pg_temp.f_vergleich('01s_liste_stern', wiki_fette_zeilen_zu_ueberschriften('* **Fett**'), '* **Fett**');
  perform pg_temp.f_vergleich('01t_zitat', wiki_fette_zeilen_zu_ueberschriften('> **Hinweis**'), '> **Hinweis**');
  perform pg_temp.f_vergleich('01u_ueberschrift', wiki_fette_zeilen_zu_ueberschriften('## **Titel**'), '## **Titel**');
  perform pg_temp.f_vergleich('01v_tabellenzeile', wiki_fette_zeilen_zu_ueberschriften('| **a** | b |'), '| **a** | b |');
  perform pg_temp.f_vergleich('01w_eingerueckt', wiki_fette_zeilen_zu_ueberschriften('  **Fett**'), '  **Fett**');
  perform pg_temp.f_vergleich('01x_kursiv', wiki_fette_zeilen_zu_ueberschriften('*Kursiv*'), '*Kursiv*');
  perform pg_temp.f_vergleich('01y_mehrzeilig', wiki_fette_zeilen_zu_ueberschriften(v_mehrzeilig), E'Einleitung\n\n### A\nText\n\n### B\n');
  perform pg_temp.f_vergleich('01z_crlf', wiki_fette_zeilen_zu_ueberschriften(E'**A**\r\nText\r\n'), E'### A\nText\r\n');
  perform pg_temp.f_vergleich('01za_leer', wiki_fette_zeilen_zu_ueberschriften(''), '');
  perform pg_temp.f_vergleich('01zb_null', wiki_fette_zeilen_zu_ueberschriften(null), null);
  perform pg_temp.f_vergleich('01zc_zweimal', wiki_fette_zeilen_zu_ueberschriften(wiki_fette_zeilen_zu_ueberschriften(v_mehrzeilig)), wiki_fette_zeilen_zu_ueberschriften(v_mehrzeilig));

  -- 02 · Bestand
  select count(*) into v_n from kb_article a, regexp_split_to_table(a.body_md, E'\n') l
   where wiki_fette_zeilen_zu_ueberschriften(l) is distinct from l;
  insert into t_res values ('02a_bestand_artikel', case when v_n = 0 then 'ok' else 'FEHLER uebrig=' || v_n end);
  select count(*) into v_n from kb_chunk c, regexp_split_to_table(c.body, E'\n') l
   where wiki_fette_zeilen_zu_ueberschriften(l) is distinct from l;
  insert into t_res values ('02b_bestand_suche', case when v_n = 0 then 'ok' else 'FEHLER uebrig=' || v_n end);
  select count(*), coalesce(string_agg(distinct a.slug, ','), '') into v_n, v_txt
    from kb_article a, regexp_split_to_table(a.body_md, E'\n') l
   where l ~ '^\*\*[^*]+\*\*:?[ \t\r]*$';
  insert into t_res values ('02c_fette_saetze', 'uebrig=' || v_n || ' in ' || v_txt
    || ' (Information; erwartet nur fette Sätze mit Punkt oder Ausrufezeichen — im Bestand vom 09.10.2026 zwei, beide im Artikel pfand)');

  -- 03 · Zählprobe je Artikelpaar
  create temp table t_h on commit drop as
    select a.slug, a.edition_id, a.language,
           (select count(*) from regexp_split_to_table(a.body_md, E'\n') l where l ~ '^### ') as n
      from kb_article a;
  select count(*) into v_paare from (select slug, edition_id from t_h group by 1, 2 having count(distinct language) = 2) p;
  select coalesce(sum(n) filter (where language = 'de'), 0), coalesce(sum(n) filter (where language = 'en'), 0) into v_de, v_en from t_h;
  select count(*), coalesce(string_agg(d.slug || ' de=' || d.n || ' en=' || e.n, '; ' order by d.slug), '') into v_abw, v_mehr
    from t_h d join t_h e on e.slug = d.slug and e.edition_id is not distinct from d.edition_id and e.language = 'en'
   where d.language = 'de' and d.n <> e.n;
  insert into t_res values ('03_zaehlprobe', 'paare=' || v_paare || ' ###_de=' || v_de || ' ###_en=' || v_en || ' abweichend=' || v_abw
    || case when v_mehr = '' then '' else ' (' || v_mehr || ')' end
    || ' (Information; die englischen Entwürfe sind eigene Fassungen — eine Abweichung heißt, dass eine Übersetzung anders gegliedert ist)');

  -- 04 · Idempotenz: ein zweiter Lauf ändert 0 Artikel
  select count(*) into v_n from kb_article where body_md is distinct from wiki_fette_zeilen_zu_ueberschriften(body_md);
  insert into t_res values ('04_idempotent', case when v_n = 0 then 'ok' else 'FEHLER artikel_geaendert=' || v_n end);

  -- 05 · Rechte
  insert into t_res values ('05_rechte', case
    when has_function_privilege('anon', 'wiki_fette_zeilen_zu_ueberschriften(text)', 'execute')
      or has_function_privilege('authenticated', 'wiki_fette_zeilen_zu_ueberschriften(text)', 'execute')
    then 'FEHLER ausfuehrbar' else 'ok' end);
end $$;
select * from t_res order by step;
rollback;
