-- Smoke-Test (Kontakte bearbeiten und CC-Kontakt, PART-062/063). Nummer offen. Belegt:
--   01 eine selbst angelegte Person hat Pflegerecht (`partner_contacts.editable`), eine schon
--      vorhandene Person und der Hauptkontakt selbst (mit Login) nicht;
--   02 `partner_contacts` behält die alten Spalten in Reihenfolge und Bedeutung (drop + create);
--   03 Adresse korrigieren, solange die Einladung wartet: Person, Adresse und die **wartende**
--      Einladung ziehen um (eine Zeile, neue Adresse, neuer Vorname) — Vorbedingung: vorher gab
--      es genau eine wartende Einladung;
--   04 ist die Einladung schon verschickt, entsteht eine neue an die neue Adresse;
--   05 bei einer vorhandenen Person weist ein Namenswechsel ab (`contact_not_editable`), die
--      Position geht, und unveränderte Werte mitzuschicken ist kein Fehler;
--   06 nach dem ersten Login pflegt die Person selbst — Vorbedingung: vorher hatte sie das Recht;
--   07 Position ist Pflicht (22023), 08 eine Adresse eines anderen Profils (`email_in_use`) und
--      eine kaputte Adresse (22023) werden abgewiesen;
--   09 Rollen gehen über dieselbe Regel wie `set_contact_roles` (ungültige Rolle 22023);
--   10 die Kopie hängt an der Mail an den Hauptkontakt, nicht an der an die einreichende Person,
--      und nur reine CC-Kontakte stehen darin (Vorbedingung: beide Mails sind entstanden); alle
--      fünf Partner-Mail-Funktionen rufen `partner_mail_cc`; im Protokoll steht **keine Adresse**
--      der Kopie, erst `mail_cc_recipients` löst sie auf — und lässt eine gelöschte Person weg;
--   11 eine Einladung trägt nie eine Kopie; 12 an eine schon verschickte Mail hängt nichts an;
--   13 fremde Organisation 42501; `anon` darf `update_partner_contact` nicht, `authenticated`
--      darf weder `partner_mail_cc` noch `mail_cc_recipients`, der Versand (`service_role`) darf
--      `mail_cc_recipients` — sonst bliebe jede Mail mit Kopie liegen; 14 die Rollenbezeichnungen
--      stehen im Vokabular.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid; v_fremd uuid; v_oe uuid;
  v_neu uuid; v_neu2 uuid; v_bestand uuid; v_cc uuid; v_ccop uuid; v_zweit uuid; v_zweit_uid uuid;
  v_tag text := substr(md5(random()::text), 1, 10);
  v_m_neu text; v_m_neu2 text; v_m_neu3 text; v_m_x text; v_m_bestand text; v_m_cc text; v_m_ccop text;
  v_n integer; v_n2 integer; v_txt text; v_txt2 text; v_b boolean; v_j jsonb; v_del uuid; v_tpl uuid;
  v_sent bigint;
begin
  v_m_neu     := 'zz-neu-' || v_tag || '@example.org';
  v_m_neu2    := 'zz-neu2-' || v_tag || '@example.org';
  v_m_neu3    := 'zz-neu3-' || v_tag || '@example.org';
  v_m_x       := 'zz-x-' || v_tag || '@example.org';
  v_m_bestand := 'zz-bestand-' || v_tag || '@example.org';
  v_m_cc      := 'zz-cc-' || v_tag || '@example.org';
  v_m_ccop    := 'zz-ccop-' || v_tag || '@example.org';

  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into organization (legal_name) values ('ZZ Kontakte GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Kontakte GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited')
    returning id into v_oe;
  perform upsert_partner_contact(v_org, v_email, 'Test', 'Person', '{primary_ops}');
  -- Eine Person, die es schon gibt, bevor die Organisation sie einlädt.
  insert into person (first_name, last_name) values ('ZZ Bestand', 'Person') returning id into v_bestand;
  insert into person_email (person_id, email, is_primary, verified) values (v_bestand, v_m_bestand, true, false);
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- Ab hier handelt der Hauptkontakt, kein Team.
  v_cc   := upsert_partner_contact(v_org, v_m_cc, 'ZZ Nur', 'Kopie', '{cc}', 'Teamleitung');
  v_ccop := upsert_partner_contact(v_org, v_m_ccop, 'ZZ Kopie', 'Operativ', '{cc,additional}', 'Projektleitung');
  v_neu  := upsert_partner_contact(v_org, v_m_neu, 'ZZ Neu', 'Kontakt', '{additional}', 'Einkauf');
  perform upsert_partner_contact(v_org, v_m_bestand, 'Egal', 'Egal', '{additional}', 'Vertrieb');

  -- 01 Pflegerecht
  select count(*) filter (where c.person_id = v_neu and c.editable)
       + count(*) filter (where c.person_id = v_bestand and not c.editable)
       + count(*) filter (where c.person_id = v_pid and not c.editable)
    into v_n from partner_contacts(v_org) c;
  insert into t_res values ('01_pflegerecht',
    case when v_n = 3 then 'neu ja, Bestand nein, Hauptkontakt nein (richtig)' else 'unerwartet ' || v_n || '/3' end);

  -- 02 Alte Spalten unverändert
  select c.has_login into v_b from partner_contacts(v_org) c where c.person_id = v_pid;
  v_txt := pg_get_function_result('partner_contacts(uuid)'::regprocedure);
  insert into t_res values ('02_alte_spalten',
    case when v_b and v_txt like '%contact_position text, roles text[], has_login boolean, invited_at timestamp with time zone, editable boolean)'
         then 'Reihenfolge und has_login unverändert, editable am Ende (richtig)'
         else 'unerwartet: ' || coalesce(v_b::text, 'null') || ' ' || v_txt end);

  -- 03 Adresse korrigieren, die wartende Einladung zieht um
  select count(*)::integer into v_n from mail_log
   where template_key = 'partner_contact_invite' and person_id = v_neu and status = 'queued';
  perform update_partner_contact(v_org, v_neu, 'Einkauf', 'ZZ Neue', 'Kontaktin', v_m_neu2, null);
  select count(*)::integer,
         count(*) filter (where to_email = v_m_neu2::citext and meta->'vars'->>'first_name' = 'ZZ Neue')::integer
    into v_n2, v_sent from mail_log where template_key = 'partner_contact_invite' and person_id = v_neu;
  select (pe.email = v_m_neu2::citext and p.first_name = 'ZZ Neue' and p.last_name = 'Kontaktin') into v_b
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.id = v_neu;
  insert into t_res values ('03_einladung_zieht_um',
    case when v_n <> 1 then 'VORBEDINGUNG: ' || v_n || ' wartende Einladungen statt 1'
         when v_n2 = 1 and v_sent = 1 and v_b then 'Person, Adresse und wartende Einladung umgezogen (richtig)'
         else 'unerwartet: ' || v_n2 || ' Einladungen, ' || v_sent || ' passend, Person ' || coalesce(v_b::text, 'null') end);

  -- 04 Schon verschickt: neue Einladung
  update mail_log set status = 'sent', sent_at = now()
   where template_key = 'partner_contact_invite' and person_id = v_neu
   returning id into v_sent;
  perform update_partner_contact(v_org, v_neu, 'Einkauf', null, null, v_m_neu3, null);
  select count(*)::integer, count(*) filter (where status = 'queued' and to_email = v_m_neu3::citext)::integer
    into v_n, v_n2 from mail_log where template_key = 'partner_contact_invite' and person_id = v_neu;
  insert into t_res values ('04_neue_einladung',
    case when v_n = 2 and v_n2 = 1 then 'alte bleibt verschickt, neue wartet an die neue Adresse (richtig)'
         else 'unerwartet: ' || v_n || ' gesamt, ' || v_n2 || ' wartend' end);

  -- 05 Vorhandene Person: Name nein, Position ja, unveränderte Werte kein Fehler
  begin
    perform update_partner_contact(v_org, v_bestand, 'Vertrieb', 'Anders', 'Person', null, null);
    insert into t_res values ('05_bestand_name', 'ALLOWED (BUG): fremdes Profil umbenannt');
  exception
    when sqlstate 'P0001' then insert into t_res values ('05_bestand_name',
      case when sqlerrm = 'contact_not_editable' then 'contact_not_editable (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('05_bestand_name', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  perform update_partner_contact(v_org, v_bestand, 'Vertriebsleitung', null, null, null, null);
  select om.contact_position, p.first_name into v_txt, v_txt2
    from org_membership om join person p on p.id = om.person_id where om.org_id = v_org and om.person_id = v_bestand;
  insert into t_res values ('05b_bestand_position',
    case when v_txt = 'Vertriebsleitung' and v_txt2 = 'ZZ Bestand' then 'Position geändert, Name unberührt (richtig)'
         else 'unerwartet: ' || coalesce(v_txt, 'null') || ' / ' || coalesce(v_txt2, 'null') end);
  begin
    perform update_partner_contact(v_org, v_bestand, 'Vertriebsleitung', 'ZZ Bestand', 'Person', v_m_bestand, null);
    insert into t_res values ('05c_unveraendert_ok', 'kein Fehler bei unveränderten Werten (richtig)');
  exception when others then
    insert into t_res values ('05c_unveraendert_ok', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 Nach dem ersten Login pflegt die Person selbst (das Konto wird geliehen)
  select c.editable into v_b from partner_contacts(v_org) c where c.person_id = v_neu;
  select p.id, p.auth_user_id into v_zweit, v_zweit_uid from person p
   where p.auth_user_id is not null and p.id <> v_pid limit 1;
  update person set auth_user_id = null where id = v_zweit;
  update person set auth_user_id = v_zweit_uid where id = v_neu;
  begin
    perform update_partner_contact(v_org, v_neu, 'Einkauf', 'Noch', 'Anders', null, null);
    insert into t_res values ('06_nach_login', 'ALLOWED (BUG): nach dem Login umbenannt');
  exception
    when sqlstate 'P0001' then insert into t_res values ('06_nach_login',
      case when not coalesce(v_b, false) then 'VORBEDINGUNG: vorher kein Pflegerecht — Schritt belegt nichts'
           when sqlerrm = 'contact_not_editable' then 'vorher ja, nach Login contact_not_editable (richtig)'
           else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('06_nach_login', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 07 Position ist Pflicht
  begin
    perform update_partner_contact(v_org, v_bestand, '  ', null, null, null, null);
    insert into t_res values ('07_position_pflicht', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('07_position_pflicht',
      case when sqlerrm = 'position_required' then 'position_required (richtig)' else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('07_position_pflicht', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 Adresse eines anderen Profils, kaputte Adresse
  v_neu2 := upsert_partner_contact(v_org, v_m_x, 'ZZ Zweiter', 'Neuer', '{additional}', 'Marketing');
  begin
    perform update_partner_contact(v_org, v_neu2, 'Marketing', null, null, v_m_bestand, null);
    insert into t_res values ('08_email_in_use', 'ALLOWED (BUG): zwei Profile, eine Adresse');
  exception
    when sqlstate 'P0001' then insert into t_res values ('08_email_in_use',
      case when sqlerrm = 'email_in_use' then 'email_in_use (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('08_email_in_use', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform update_partner_contact(v_org, v_neu2, 'Marketing', null, null, 'keine-adresse', null);
    insert into t_res values ('08b_email_kaputt', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('08b_email_kaputt',
      case when sqlerrm = 'invalid_email' then 'invalid_email (richtig)' else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('08b_email_kaputt', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 09 Rollen über dieselbe Regel
  perform update_partner_contact(v_org, v_neu2, 'Marketing', null, null, null, '{cc}');
  select roles::text into v_txt from org_membership where org_id = v_org and person_id = v_neu2;
  insert into t_res values ('09_rollen', case when v_txt = '{cc}' then 'Rolle cc gesetzt (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);
  begin
    perform update_partner_contact(v_org, v_neu2, 'Marketing', null, null, null, '{erfunden}');
    insert into t_res values ('09b_rolle_ungueltig', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('09b_rolle_ungueltig',
      case when sqlerrm = 'invalid_role' then 'invalid_role (richtig)' else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('09b_rolle_ungueltig', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  -- v_neu2 ist jetzt reiner CC-Kontakt; für Schritt 10 zurück auf operativ, damit genau v_cc übrig bleibt.
  perform update_partner_contact(v_org, v_neu2, 'Marketing', null, null, null, '{additional}');

  -- 13a Fremde Organisation (noch ohne Team-Rolle)
  begin
    perform update_partner_contact(v_fremd, v_pid, 'Irgendwas', null, null, null, null);
    insert into t_res values ('13_fremde_org', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('13_fremde_org', '42501 (richtig)');
    when others then insert into t_res values ('13_fremde_org', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 10 Kopie an einer echten Partner-Mail: Rückweisung einer Lieferung durch das Team
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select t.id into v_tpl from deliverable_template t
   where not exists (select 1 from deliverable d where d.org_edition_id = v_oe and d.template_id = t.id) limit 1;
  insert into deliverable (org_edition_id, template_id, key, status, submitted_at, submitted_by, asset_ids, answers)
  values (v_oe, v_tpl, 'zz_cc_test', 'submitted', now(), v_bestand, '{}', '{}'::jsonb) returning id into v_del;
  perform review_deliverable(v_del, false, 'ZZ bitte als SVG');
  select count(*)::integer into v_n from mail_log where template_key = 'partner_deliverable_rejected' and related_id = v_del;
  select meta->'cc_person_ids' into v_j from mail_log
   where template_key = 'partner_deliverable_rejected' and related_id = v_del and person_id = v_pid;
  select count(*)::integer into v_n2 from mail_log
   where template_key = 'partner_deliverable_rejected' and related_id = v_del and person_id = v_bestand and meta ? 'cc_person_ids';
  insert into t_res values ('10_kopie_am_hauptkontakt',
    case when v_n <> 2 then 'VORBEDINGUNG: ' || v_n || ' Mails statt 2 — Schritt belegt nichts'
         when v_j = jsonb_build_array(v_cc) and v_n2 = 0
           then 'nur der reine CC-Kontakt, nur an der Mail an den Hauptkontakt (richtig)'
         else 'unerwartet: cc=' || coalesce(v_j::text, 'null') || ', an der Einreicherin ' || v_n2 end);
  select count(*)::integer into v_n from pg_proc
   where proname in ('shop_confirm', 'run_shop_finalization', 'submit_deliverable', 'review_deliverable', 'send_partner_reminders')
     and prosrc like '%partner_mail_cc(v_mail%';
  insert into t_res values ('10b_alle_fuenf',
    case when v_n = 5 then 'alle fünf Partner-Mails hängen die Kopie an (richtig)' else 'unerwartet: ' || v_n || '/5' end);
  select count(*)::integer into v_n from mail_log where meta::text ilike '%' || v_m_cc || '%';
  select string_agg(email, ',') into v_txt from mail_cc_recipients(array[v_cc]);
  update person set deleted_at = now() where id = v_cc;
  select count(*)::integer into v_n2 from mail_cc_recipients(array[v_cc]);
  update person set deleted_at = null where id = v_cc;
  insert into t_res values ('10c_adresse_erst_beim_versand',
    case when v_n = 0 and v_txt = v_m_cc and v_n2 = 0
           then 'keine Adresse im Protokoll, Auflösung beim Versand, gelöschte Person fällt weg (richtig)'
         else 'unerwartet: ' || v_n || ' Protokollzeilen mit Adresse, aufgelöst ' || coalesce(v_txt, 'nichts') || ', gelöscht ' || v_n2 end);

  -- 11 Einladungen tragen nie eine Kopie (Vorbedingung: es gibt Einladungen nach dem CC-Kontakt)
  select count(*)::integer, count(*) filter (where meta ? 'cc_person_ids')::integer into v_n, v_n2 from mail_log
   where template_key = 'partner_contact_invite' and person_id in (v_neu, v_neu2, v_bestand);
  insert into t_res values ('11_einladung_ohne_kopie',
    case when v_n = 0 then 'VORBEDINGUNG: keine Einladung — Schritt belegt nichts'
         when v_n2 = 0 then v_n || ' Einladungen, keine mit Kopie (richtig)'
         else 'ALLOWED (BUG): ' || v_n2 || ' Einladungen mit Kopie' end);

  -- 12 An eine schon verschickte Mail hängt nichts an
  select partner_mail_cc(v_sent, v_org) into v_n;
  select count(*)::integer into v_n2 from mail_log where id = v_sent and meta ? 'cc_person_ids';
  insert into t_res values ('12_nicht_an_verschickte',
    case when v_n = 0 and v_n2 = 0 then 'verschickte Mail unberührt (richtig)' else 'unerwartet ' || v_n || '/' || v_n2 end);
end $$;

insert into t_res
select '13b_rechte',
       case when has_function_privilege('anon', 'update_partner_contact(uuid, uuid, text, text, text, text, text[])', 'execute')
              then 'ALLOWED (BUG): anon darf bearbeiten'
            when has_function_privilege('authenticated', 'partner_mail_cc(bigint, uuid)', 'execute')
              then 'ALLOWED (BUG): authenticated darf Kopien anhängen'
            when has_function_privilege('authenticated', 'mail_cc_recipients(uuid[])', 'execute')
              then 'ALLOWED (BUG): authenticated liest Adressen'
            when not has_function_privilege('service_role', 'mail_cc_recipients(uuid[])', 'execute')
              then 'BUG: der Versand darf die Adressen nicht auflösen'
            else 'anon gesperrt, beide Helfer intern, Versand darf auflösen (richtig)' end;

insert into t_res
select '14_bezeichnungen',
       case when count(*) = 3 then 'Hauptkontakt, weiterer operativer Kontakt, CC-Kontakt (richtig)'
            else 'unerwartet: ' || count(*) || '/3' end
  from vocab_term
 where vocabulary = 'contact_role'
   and ((key = 'primary_ops' and label_de = 'Hauptkontakt' and label_en = 'Primary contact')
     or (key = 'additional' and label_de = 'Weiterer operativer Kontakt' and label_en = 'Additional operational contact')
     or (key = 'cc' and label_de = 'CC-Kontakt' and label_en = 'CC contact'));

select * from t_res order by step;
rollback;
