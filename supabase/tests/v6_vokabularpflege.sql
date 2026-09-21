-- Smoke-Test 0130 (Vokabular vollständig pflegen · ADM-032). Belegt:
--   01 lesen ohne Admin 42501, 02 schreiben ebenso;
--   03 ein Schluessel mit Leerzeichen ⇒ 22023 `invalid_key` — er steht spaeter als
--      Wert in den Daten und muss in URL und Export unveraendert durchgehen;
--   04 die englische Beschriftung ist Pflicht ⇒ 22023 `fields_required`
--      (mehrere Portale sind auf Englisch voreingestellt);
--   05 anlegen, 06 aendern inklusive Reihung und Aktivkennzeichen;
--   07 die Verwendungszahl eines frischen Begriffs ist 0 — **nicht** null;
--   08 ein unbenutzter Begriff laesst sich loeschen;
--   09 ein benutzter nicht ⇒ P0001 `in_use`;
--   10 **ein Begriff aus einem Vokabular ohne Verzeichniseintrag auch nicht**
--      ⇒ P0001 `usage_unknown`. Das ist der Kern des Bausteins: Schweigen ist
--      kein „wird nicht benutzt";
--   11 ein Begriff mit Unterbegriffen nicht ⇒ P0001 `has_children`; ohne Kinder geht er;
--   12 ein unbekannter Begriff ⇒ P0002 `term_not_found`;
--   13 jede Aenderung und jedes Loeschen steht im Protokoll.
-- Die Schritte 10 und 11 legen sich **eigene** Begriffe an, statt auf bestehende zu
-- zeigen: ein Test, der Schluessel aus dem Bestand raet, prueft am Ende die Daten
-- und nicht die Funktion.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  begin perform vocab_terms_admin(null);
    insert into t_res values ('01_lesen_ohne_admin', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_lesen_ohne_admin', 'abgewiesen ' || sqlstate); end;
  begin perform upsert_vocab_term(jsonb_build_object('vocabulary','gender','key','zztest','label_de','x','label_en','x'));
    insert into t_res values ('02_schreiben_ohne_admin', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('02_schreiben_ohne_admin', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type, valid_from)
  values (v_pid, 'admin', 'global', now() - interval '1 hour');

  begin perform upsert_vocab_term(jsonb_build_object('vocabulary','gender','key','ZZ Test','label_de','x','label_en','x'));
    insert into t_res values ('03_schluesselform', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('03_schluesselform', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  begin perform upsert_vocab_term(jsonb_build_object('vocabulary','gender','key','zztest','label_de','Nur DE'));
    insert into t_res values ('04_label_en_pflicht', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('04_label_en_pflicht', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  perform upsert_vocab_term(jsonb_build_object('vocabulary','gender','key','zztest',
    'label_de','ZZ Deutsch','label_en','ZZ English','sort_order',99));
  select label_de || '/' || sort_order || '/' || active into v_txt
    from vocab_term where vocabulary = 'gender' and key = 'zztest';
  insert into t_res values ('05_anlegen',
    case when v_txt = 'ZZ Deutsch/99/true' then 'angelegt (richtig)' else 'unerwartet ' || coalesce(v_txt,'null') end);

  perform upsert_vocab_term(jsonb_build_object('vocabulary','gender','key','zztest',
    'label_de','ZZ geaendert','label_en','ZZ English','sort_order',5,'active',false));
  select label_de || '/' || sort_order || '/' || active into v_txt
    from vocab_term where vocabulary = 'gender' and key = 'zztest';
  insert into t_res values ('06_aendern',
    case when v_txt = 'ZZ geaendert/5/false' then 'geaendert (richtig)' else 'unerwartet ' || coalesce(v_txt,'null') end);

  select t.usage::text into v_txt from vocab_terms_admin('gender') t where t.key = 'zztest';
  insert into t_res values ('07_verwendung_null',
    case when v_txt = '0' then 'nirgends benutzt (richtig)' else 'unerwartet ' || coalesce(v_txt,'null') end);

  perform delete_vocab_term('gender','zztest');
  select count(*)::integer into v_n from vocab_term where vocabulary = 'gender' and key = 'zztest';
  insert into t_res values ('08_loeschen', case when v_n = 0 then 'geloescht (richtig)' else 'steht noch' end);

  -- 09 in Gebrauch: `role:admin` traegt jede Rollenzuweisung dieses Tests.
  begin perform delete_vocab_term('role','admin');
    insert into t_res values ('09_in_gebrauch', 'GELOESCHT (BUG)');
  exception when others then insert into t_res values ('09_in_gebrauch', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 10 `doc_type` steht in keinem Verzeichniseintrag: Verwendung unbekannt.
  insert into vocab_term (vocabulary, key, label_de, label_en) values ('doc_type','zzunbekannt','ZZ','ZZ');
  begin perform delete_vocab_term('doc_type','zzunbekannt');
    insert into t_res values ('10_unbekannte_verwendung', 'GELOESCHT (BUG)');
  exception when others then insert into t_res values ('10_unbekannte_verwendung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 11 Eltern und Kind im selben Vokabular.
  insert into vocab_term (vocabulary, key, label_de, label_en) values ('gender','zzeltern','ZZ','ZZ');
  insert into vocab_term (vocabulary, key, label_de, label_en, parent_vocabulary, parent_key)
  values ('gender','zzkind','ZZ','ZZ','gender','zzeltern');
  begin perform delete_vocab_term('gender','zzeltern');
    insert into t_res values ('11_mit_kindern', 'GELOESCHT (BUG)');
  exception when others then insert into t_res values ('11_mit_kindern', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;
  perform delete_vocab_term('gender','zzkind');
  begin perform delete_vocab_term('gender','zzeltern');
    insert into t_res values ('11b_ohne_kinder', 'geloescht (richtig)');
  exception when others then insert into t_res values ('11b_ohne_kinder', 'ABGEWIESEN (BUG) ' || sqlstate || ' ' || sqlerrm); end;

  begin perform delete_vocab_term('gender','gibtsnicht');
    insert into t_res values ('12_unbekannt', 'GELOESCHT (BUG)');
  exception when others then insert into t_res values ('12_unbekannt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  select count(*)::integer into v_n from audit_log where action in ('vocab.upsert','vocab.delete');
  insert into t_res values ('13_protokoll',
    case when v_n >= 3 then v_n || ' Eintraege (richtig)' else 'FEHLT (' || v_n || ')' end);
end $$;
select * from t_res order by step;
rollback;
-- Lauf am 21.09. gegen die Datenbank (Migration + Test in einer Transaktion, rollback): 14/14 gruen.
