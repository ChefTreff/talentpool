-- Smoke-Test ADM-048 (Logo-Produktionsliste). Belegt:
--   01 ohne Abschnittsrecht 42501; `marketing_team` darf (die Wand druckt nicht
--      das Partner-Team allein);
--   02 **die Umkehrung**: ein Partner **ohne jede Datei und ohne Einwilligung**
--      steht in der Liste — mit leeren Zellen. Genau der wird sonst vergessen,
--      und eine Liste, die ihn weglaesst, sieht vollstaendig aus;
--   03 `fehlt` benennt beides einzeln und zusammen;
--   04 `druckbar` ist nur wahr, wenn **Vektordatei und Einwilligung** da sind —
--      eines von beidem genuegt nicht;
--   05 eine abgelehnte Datei zaehlt nicht als vorhanden;
--   06 eine noch ungepruefte Datei zaehlt, wird aber im Text vermerkt.
-- Der Test legt Partner mit und ohne Logo an und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_o1 uuid; v_o2 uuid; v_o3 uuid; v_oe1 uuid; v_oe2 uuid; v_oe3 uuid; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select id into v_ed from event where is_edition and slug = 'fls27';

  perform set_config('request.jwt.claims', '', true);
  insert into organization (legal_name, communication_name, type, active) values
    ('ZZTEST Alpha GmbH', 'ZZTEST Alpha', 'corporate', true),
    ('ZZTEST Beta GmbH', 'ZZTEST Beta', 'corporate', true),
    ('ZZTEST Gamma GmbH', 'ZZTEST Gamma', 'corporate', true);
  select id into v_o1 from organization where legal_name = 'ZZTEST Alpha GmbH';
  select id into v_o2 from organization where legal_name = 'ZZTEST Beta GmbH';
  select id into v_o3 from organization where legal_name = 'ZZTEST Gamma GmbH';
  -- Alpha: alles da. Beta: Datei, aber keine Einwilligung. Gamma: nichts.
  insert into org_edition (org_id, edition_id, onboarding_status, logo_whitening_consent_at)
  values (v_o1, v_ed, 'invited', now()) returning id into v_oe1;
  insert into org_edition (org_id, edition_id, onboarding_status)
  values (v_o2, v_ed, 'invited') returning id into v_oe2;
  insert into org_edition (org_id, edition_id, onboarding_status, logo_whitening_consent_at)
  values (v_o3, v_ed, 'invited', now()) returning id into v_oe3;
  insert into partner_asset (org_edition_id, kind, storage_path, filename, status) values
    (v_oe1, 'logo_vector', 'zz/1/logo.svg', 'alpha.svg', 'accepted'),
    (v_oe2, 'logo_vector', 'zz/2/logo.eps', 'beta.eps', 'accepted'),
    -- Gamma hat nur eine abgelehnte Datei: das ist keine.
    (v_oe3, 'logo_vector', 'zz/3/logo.svg', 'gamma.svg', 'rejected');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 Rechte
  begin perform partner_logo_production(v_ed); insert into t_res values ('01a_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01a_ohne_recht', 'abgewiesen ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'marketing_team', 'global');
  select count(*) into v_n from partner_logo_production(v_ed);
  insert into t_res values ('01b_marketing', v_n::text || ' Zeilen');

  -- 02 die Umkehrung: der Partner ohne alles steht drin
  select coalesce(x.vektor_datei, '(leer)') || ' · Einwilligung ' ||
         (case when x.einwilligung is null then 'fehlt' else 'da' end)
    into v_txt from partner_logo_production(v_ed) x where x.org_id = v_o3;
  insert into t_res values ('02_ohne_alles_dabei', coalesce(v_txt, 'FEHLT IN DER LISTE (BUG)'));

  -- 03/04 druckbar und fehlt
  select (case when x.druckbar then 'druckbar' else 'nein' end) || ' · ' || coalesce(x.fehlt, '(nichts fehlt)')
    into v_txt from partner_logo_production(v_ed) x where x.org_id = v_o1;
  insert into t_res values ('04a_alles_da', v_txt);
  select (case when x.druckbar then 'druckbar' else 'nein' end) || ' · ' || coalesce(x.fehlt, '(nichts fehlt)')
    into v_txt from partner_logo_production(v_ed) x where x.org_id = v_o2;
  insert into t_res values ('04b_ohne_einwilligung', v_txt);
  select (case when x.druckbar then 'druckbar' else 'nein' end) || ' · ' || coalesce(x.fehlt, '(nichts fehlt)')
    into v_txt from partner_logo_production(v_ed) x where x.org_id = v_o3;
  insert into t_res values ('03_ohne_datei', v_txt);

  -- 05 abgelehnte Datei zaehlt nicht
  select coalesce(x.vektor_datei, '(leer)') into v_txt
    from partner_logo_production(v_ed) x where x.org_id = v_o3;
  insert into t_res values ('05_abgelehnt_zaehlt_nicht', v_txt);

  -- 06 ungeprueft zaehlt, wird aber vermerkt
  update partner_asset set status = 'pending' where org_edition_id = v_oe1;
  select (case when x.druckbar then 'druckbar' else 'nein' end) || ' · ' || coalesce(x.fehlt, '(nichts)')
    into v_txt from partner_logo_production(v_ed) x where x.org_id = v_o1;
  insert into t_res values ('06_ungeprueft', v_txt);
end $$;

select * from t_res order by step;
rollback;

-- Lauf 25.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 8/8 gruen.
--   01a ohne Recht abgewiesen 42501, 01b marketing_team sieht 6 Zeilen;
--   02 der Partner **ohne alles** steht in der Liste: '(leer) · Einwilligung da';
--   03 'nein · Vektordatei fehlt'; 04a 'druckbar · (nichts fehlt)',
--   04b 'nein · Einwilligung zum Weissen fehlt';
--   05 abgelehnte Datei zaehlt nicht: '(leer)';
--   06 ungeprueft zaehlt, wird aber vermerkt: 'druckbar · Datei noch ungeprueft'.
