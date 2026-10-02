-- Smoke-Test PART-093 (3D-Rundgang als Link-Eintrag). Belegt, mit echtem Rollenwechsel (Admin, Partner, ohne Rolle):
--   01 der Startwert steht: Schlüssel partner_3d_tour, Matterport-Adresse, nur Zielgruppe partner, ohne Edition;
--   02 die Migration ist wiederholbar und überschreibt nichts: ein von Hand geänderter Eintrag bleibt, es entsteht
--      keine zweite Zeile;
--   03 der Admin sieht den Eintrag in der Pflegeliste (`portal_links_admin`) mit Zielgruppe;
--   04 ein Partner liest den Rundgang über `portal_links_for`; ein Eintrag der Edition geht dem allgemeinen vor;
--   05 wer nicht Partner ist (ohne Rolle), bekommt ihn für die Zielgruppe partner nicht: 42501;
--   06 der Eintrag lässt sich nur über die Pflegefunktion ändern: ein Partner scheitert an `upsert_portal_link` (42501).
-- Läuft gegen einen Bestand ohne eigenen Eintrag `partner_3d_tour` (der Startwert kommt aus der Migration).
-- Probelauf 02.10.2026 (`db.sh dry-run`, gegen live, zurückgerollt): 6/6 grün. Gegen live ohne Migration rot:
-- Schritt 01 (kein Startwert) und 02 (die Zeile entsteht erst durch den Test selbst); die Schritte 03–06 prüfen
-- die vorhandenen Pflege- und Lesefunktionen und sind unabhängig von der Migration. Rollen-Probe
-- `sicherheit_rollenkonten` mit der Migration: 6/6 ok.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_org uuid;
  v_url text; v_aud text[]; v_ed_link uuid; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- ab hier Admin
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');

  -- 01 Startwert
  select l.url, l.audience, l.edition_id::text into v_url, v_aud, v_txt
    from portal_link l where l.key = 'partner_3d_tour' and l.edition_id is null;
  insert into t_res values ('01_startwert',
    case when v_url = 'https://my.matterport.com/show/?m=Aj4uVT45GpQ' and v_aud = array['partner']::text[] and v_txt is null
         then 'ok: ' || v_url || ' · nur partner · ohne Edition'
         else 'FALSCH: ' || coalesce(v_url, '(kein Eintrag)') || ' / ' || coalesce(array_to_string(v_aud, ','), '-') end);

  -- 02 wiederholbar, überschreibt nichts
  update portal_link set url = 'https://my.matterport.com/show/?m=ZZTEST000001' where key = 'partner_3d_tour' and edition_id is null;
  insert into portal_link (key, title_de, title_en, url, audience, sort_order) values
    ('partner_3d_tour', 'Summit-Rundgang in 3D', 'Summit tour in 3D',
     'https://my.matterport.com/show/?m=Aj4uVT45GpQ', array['partner'], 30)
  on conflict do nothing;
  select count(*)::integer, min(l.url) into v_n, v_url from portal_link l where l.key = 'partner_3d_tour';
  insert into t_res values ('02_wiederholbar',
    case when v_n = 1 and v_url = 'https://my.matterport.com/show/?m=ZZTEST000001'
         then 'ok: eine Zeile, die von Hand geänderte Adresse bleibt'
         else 'FALSCH: ' || v_n || ' Zeile(n), ' || coalesce(v_url, '-') end);

  -- 03 Pflegeliste des Admins
  select string_agg(array_to_string(a.audience, ','), ';') into v_txt from portal_links_admin() a where a.key = 'partner_3d_tour';
  insert into t_res values ('03_pflegeliste', case when v_txt = 'partner' then 'ok: in der Pflegeliste, Zielgruppe partner' else 'FALSCH: ' || coalesce(v_txt, '(fehlt)') end);

  -- Eintrag der Edition für 04 (geht dem allgemeinen vor)
  v_ed_link := upsert_portal_link(jsonb_build_object('key', 'partner_3d_tour', 'url', 'https://my.matterport.com/show/?m=ZZTEST000002',
                                                    'audience', jsonb_build_array('partner'), 'edition_id', v_ed));

  -- Rollenwechsel: Partner einer Wegwerf-Organisation
  delete from role_assignment where person_id = v_pid;
  insert into organization (legal_name) values ('ZZTEST Rundgang GmbH') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  if is_staff() then raise exception 'VORBEDINGUNG: Konto ist noch Admin'; end if;

  -- 04 der Partner liest ihn; der Eintrag der Edition geht vor
  select l.url into v_url from portal_links_for(array['partner_3d_tour'], 'partner', v_ed) l;
  insert into t_res values ('04_partner_liest',
    case when v_url = 'https://my.matterport.com/show/?m=ZZTEST000002' then 'ok: der Eintrag der Edition vor dem allgemeinen'
         else 'FALSCH: ' || coalesce(v_url, '(nichts)') end);

  -- 06 nicht pflegen (vor dem Wechsel auf „ohne Rolle“)
  begin
    perform upsert_portal_link(jsonb_build_object('id', v_ed_link, 'url', 'https://example.org/'));
    insert into t_res values ('06_nicht_pflegen', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('06_nicht_pflegen', 'ok: 42501');
    when others then insert into t_res values ('06_nicht_pflegen', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 ohne Rolle: nicht Partner
  delete from role_assignment where person_id = v_pid;
  begin
    perform * from portal_links_for(array['partner_3d_tour'], 'partner', v_ed);
    insert into t_res values ('05_ohne_rolle', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('05_ohne_rolle', 'ok: 42501');
    when others then insert into t_res values ('05_ohne_rolle', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

select * from t_res order by step;
rollback;
