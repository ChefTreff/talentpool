-- Smoke-Test PORT4b (Zugaenge sperren statt loeschen). Belegt:
--   01 **alle sechs** Rechtefunktionen kennen die Sperre. Eine, die sie nicht
--      kennt, waere ein offenes Tor neben einer verschlossenen Tuer:
--      `has_role`, `active_roles`, `my_roles`, `is_kiosk_only`, `checkin_edition`,
--      `can_edit_edition_info`;
--   02 entsperren stellt **alles** wieder her — `role_assignment` wurde nicht
--      angefasst, sonst waere die Sperre eine Loeschung mit anderem Namen;
--   03 die Person und ihre Geschichte bleiben: Zeile, Name, Mailadresse da;
--   04 **sich selbst sperrt niemand** (`cannot_block_self`);
--   05 ohne Abschnittsrecht 42501 auf Liste und Sperre — auch fuer eine Teamrolle;
--   06 die Liste zeigt Konto, Sperre und Rollen und findet ueber Name und Adresse;
--   07 zweimal sperren ist kein Fehler und schreibt keinen zweiten Audit-Eintrag;
--   08 jede Aenderung steht im Audit-Log.
-- Der Test sperrt eine eigens angelegte Person und rollt zurueck.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_admin uuid; v_uid uuid; v_email text; v_ed uuid;
  v_opfer uuid; v_anderer uuid; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_admin, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_admin;
  select id into v_ed from event where is_edition and slug = 'fls27';

  perform set_config('request.jwt.claims', '', true);
  -- Die sechs Funktionen fragen `current_person_id()`, also braucht es ein
  -- **echtes** Konto: `person.auth_user_id` haengt an `auth.users`, eine
  -- erfundene Kennung liesse sich nicht eintragen. Geprueft wird deshalb an der
  -- Testperson selbst; gesperrt wird sie dafuer direkt, nicht ueber die RPC
  -- (die verweigert zu Recht die Selbstsperre, Schritt 04).
  v_opfer := v_admin;
  insert into role_assignment (person_id, role, scope_type) values (v_opfer, 'admin', 'global');
  insert into role_assignment (person_id, role, scope_type, edition_id)
  values (v_opfer, 'checkin_operator', 'edition', v_ed);
  -- Jemand ohne Konto, aber mit Rolle: steht in der Liste und laesst sich sperren.
  insert into person (first_name, last_name) values ('Zack', 'ZZTEST-Ohne-Konto') returning id into v_anderer;
  insert into person_email (person_id, email, is_primary) values (v_anderer, 'zztest-ohnekonto@example.org', true);
  insert into role_assignment (person_id, role, scope_type) values (v_anderer, 'volunteers_team', 'global');

  -- 01 aus der Sicht der gesperrten Person
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('01a_vorher',
    'has_role=' || has_role('admin')::text
    || ', active=' || (select count(*) from active_roles())::text
    || ', my_roles=' || (select count(*) from my_roles())::text
    || ', checkin_ed=' || (checkin_edition() is not null)::text
    || ', edition_info=' || can_edit_edition_info()::text);
  -- `is_kiosk_only` ist nur wahr, wenn **ausschliesslich** die Kiosk-Rolle da
  -- ist. Mit der Admin-Rolle daneben waere die Pruefung in beiden Richtungen
  -- false und bewiese nichts — deshalb eigens ohne sie.
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_opfer and role = 'admin';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('01c_kiosk_vorher', is_kiosk_only()::text);
  perform set_config('request.jwt.claims', '', true);
  update person set access_blocked_at = now() where id = v_opfer;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('01d_kiosk_gesperrt', is_kiosk_only()::text);
  perform set_config('request.jwt.claims', '', true);
  update person set access_blocked_at = null where id = v_opfer;
  insert into role_assignment (person_id, role, scope_type) values (v_opfer, 'admin', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  perform set_config('request.jwt.claims', '', true);
  update person set access_blocked_at = now() where id = v_opfer;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('01b_gesperrt',
    'has_role=' || has_role('admin')::text
    || ', active=' || (select count(*) from active_roles())::text
    || ', my_roles=' || (select count(*) from my_roles())::text
    || ', checkin_ed=' || (checkin_edition() is not null)::text
    || ', edition_info=' || can_edit_edition_info()::text);

  -- 03 die Person bleibt
  perform set_config('request.jwt.claims', '', true);
  select (select count(*) from person where id = v_opfer)::text || ' Zeile, '
         || (select count(*) from person_email where person_id = v_opfer)::text || ' Adresse, '
         || (select count(*) from role_assignment where person_id = v_opfer)::text || ' Rollen'
    into v_txt;
  insert into t_res values ('03_person_bleibt', v_txt);

  -- 02 entsperren stellt wieder her
  update person set access_blocked_at = null where id = v_opfer;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('02_entsperrt',
    'has_role=' || has_role('admin')::text || ', active=' || (select count(*) from active_roles())::text);

  -- 05 Rechte am Werkzeug selbst
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  -- **Alle** Rollen weg, nicht nur einzelne: die Testperson traegt oben noch
  -- `admin`, und mit der waere die Pruefung wertlos (erster Lauf: „ERLAUBT").
  delete from role_assignment where person_id = v_admin;
  insert into role_assignment (person_id, role, scope_type) values (v_admin, 'area_lead_partner', 'global');
  begin perform access_accounts(); insert into t_res values ('05a_liste_teamrolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05a_liste_teamrolle', 'abgewiesen ' || sqlstate); end;
  begin perform set_person_access(v_anderer, true); insert into t_res values ('05b_sperre_teamrolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('05b_sperre_teamrolle', 'abgewiesen ' || sqlstate); end;

  delete from role_assignment where person_id = v_admin;
  insert into role_assignment (person_id, role, scope_type) values (v_admin, 'admin', 'global');

  -- 04 sich selbst
  begin
    perform set_person_access(v_admin, true);
    insert into t_res values ('04_selbst', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('04_selbst', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 07 zweimal sperren
  perform set_person_access(v_anderer, true, 'ZZTEST');
  perform set_person_access(v_anderer, true, 'ZZTEST nochmal');
  select count(*) into v_n from audit_log
   where action = 'access.blocked' and object_id = v_anderer::text;
  insert into t_res values ('07_zweimal', v_n::text || ' Audit-Eintrag');

  -- 08 Audit
  select coalesce(a.after->>'note', '-') into v_txt from audit_log a
   where a.action = 'access.blocked' and a.object_id = v_anderer::text order by a.id desc limit 1;
  insert into t_res values ('08_audit_notiz', v_txt);

  -- 06 die Liste
  select x.name || ' · Konto ' || x.has_login::text || ' · gesperrt ' || (x.blocked_at is not null)::text
         || ' · ' || array_to_string(x.roles, ',')
    into v_txt from access_accounts('ZZTEST-Ohne-Konto') x;
  insert into t_res values ('06a_liste', coalesce(v_txt, 'KEIN TREFFER (BUG)'));
  select count(*) into v_n from access_accounts('zztest-ohnekonto@example.org');
  insert into t_res values ('06b_ueber_die_adresse', v_n::text || ' Treffer');
  perform set_person_access(v_anderer, false, 'ZZTEST zurueck');
end $$;

select * from t_res order by step;
rollback;

-- Lauf 26.09.2026 gegen jqmqvgaiyjudkvtncijw (Probelauf, zurueckgerollt): 13/13 gruen.
--   01a vorher has_role=true, active=2, my_roles=2, checkin_ed=true, edition_info=true;
--   01b gesperrt: alle fuenf false bzw. 0;
--   01c kiosk vorher true, 01d gesperrt false (eigens ohne admin-Rolle geprueft,
--       sonst waere is_kiosk_only in beiden Richtungen false und bewiese nichts);
--   02 entsperrt: has_role=true, active=2 — die Rollen waren nie weg;
--   03 Person bleibt: 1 Zeile, 1 Adresse, 2 Rollen;
--   04 sich selbst: abgewiesen P0001 cannot_block_self;
--   05a/05b mit area_lead_partner abgewiesen 42501 (alle Rollen vorher abgeraeumt,
--       sonst stand die admin-Rolle noch und der Schritt meldete faelschlich „ERLAUBT");
--   06a Liste mit Konto, Sperre und Rollen, 06b ueber die Adresse 1 Treffer;
--   07 zweimal sperren: 1 Audit-Eintrag; 08 Notiz im Audit erhalten.
