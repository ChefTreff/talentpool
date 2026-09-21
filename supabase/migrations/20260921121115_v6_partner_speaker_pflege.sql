-- 0139 · Welle 6 B6: Der Partner pflegt seinen Speaker (PART-044).
-- Angewendet von der Architektur-Session am 21.09.2026 als 20260921121115.
--
--
-- Anlass: Konrad, 17.09. — „der Partner-Ansprechpartner pflegt die Infos, wenn der Speaker
-- (z. B. ein CEO) es nicht selbst tut". A1 (0132/0133) hat dafür die halbe Strecke gebaut:
-- `partner_add_speaker` legt das Profil an und setzt `partner_editable_until_login`, und der
-- Trigger `drop_partner_edit_on_login` lässt das Flag beim ersten Login fallen.
--
-- **Es gibt aber keinen Schreibweg, der das Flag liest.** Das Recht steht in der Datenbank
-- und wirkt nirgends — ein Zustand, der schlimmer ist als gar kein Flag, weil er aussieht,
-- als wäre die Sache erledigt. Diese Migration schließt die Lücke: eine Lesefunktion für die
-- Talk-Seite und eine Schreibfunktion mit Whitelist.
--
-- **Was der Partner pflegen darf, ist enger als das, was die Speakerin selbst pflegt.**
-- Er bekommt, was am Ende im Programm steht: Name, akademischer Titel, Position, Unternehmen,
-- Kurz- und Langbiografie in beiden Sprachen, LinkedIn und die übrigen Profile.
--
-- **Nicht** dabei, jedes mit Grund:
--   * `phone_e164` — private Nummer. Der Partner hat die Person eingetragen, nicht adoptiert.
--   * `pronouns` — eine Aussage über sich selbst; die trifft niemand für jemand anderen.
--   * `contact_*` (Assistenz ohne Portalzugang) — hängt an einer Einwilligung, die nur die
--     Speakerin geben kann (0127). Ein Partner könnte sie nicht einholen.
--   * `tech_rider` — Technikbedarf entsteht auf der Bühne, nicht im Vertrieb; die Regie
--     spricht mit der Speakerin.
--   * `preferred_language` — bestimmt, in welcher Sprache wir **ihr** schreiben.
--
-- **Anzeige nur, solange das Pflegerecht gilt** (Review-Auflage zu #68, 21.09.). Trifft die
-- Mailadresse eine bestehende Person, steht das Profil auf `partner_editable_until_login =
-- false`, und dann zeigt `partner_speakers` außer Name und Status nichts: Ein Partner, der
-- eine Adresse kennt, bekommt damit keinen Blick in fremde Stammdaten. Nach dem ersten Login
-- gilt dasselbe — ab da gehören die Angaben der Speakerin, und die Seite sagt das auch.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Lesen

-- Die Speaker, die dieser Partner eingetragen hat — für `/partner/talk`.
create or replace function partner_speakers(p_org_id uuid, p_edition_id uuid default null)
returns table (profile_id uuid, person_id uuid, session_id uuid, session_title text,
               display_name text, can_edit boolean, confirmed boolean, pipeline_status text,
               -- Vor- und Nachname getrennt, nicht nur als ganzer Name: sonst müsste die
               -- Oberfläche ihn zum Bearbeiten wieder auseinandernehmen, und „Anna von der
               -- Heide" käme als Vorname „Anna von der" zurück.
               first_name text, last_name text,
               title text, job_title text, organization_name text,
               bio_short_de text, bio_short_en text, bio_long_de text, bio_long_en text,
               linkedin_url text, socials jsonb, photo_asset_id uuid)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select sp.id, sp.person_id, se.id, se.title_de,
           btrim(concat_ws(' ', pe.first_name, pe.last_name)),
           sp.partner_editable_until_login, coalesce(ss.confirmed, false), sp.pipeline_status,
           -- Ab hier nur, solange das Pflegerecht gilt. Sonst sind es fremde Stammdaten.
           case when sp.partner_editable_until_login then pe.first_name end,
           case when sp.partner_editable_until_login then pe.last_name end,
           case when sp.partner_editable_until_login then pe.title end,
           case when sp.partner_editable_until_login then sp.job_title end,
           case when sp.partner_editable_until_login then sp.organization_name end,
           case when sp.partner_editable_until_login then sp.bio_short_de end,
           case when sp.partner_editable_until_login then sp.bio_short_en end,
           case when sp.partner_editable_until_login then sp.bio_long_de end,
           case when sp.partner_editable_until_login then sp.bio_long_en end,
           case when sp.partner_editable_until_login then pe.linkedin_url end,
           case when sp.partner_editable_until_login then sp.socials end,
           case when sp.partner_editable_until_login then sp.photo_asset_id end
      from speaker_profile sp
      join person pe on pe.id = sp.person_id
      left join session_speaker ss on ss.person_id = sp.person_id
      left join session se on se.id = ss.session_id and se.partner_org_id = p_org_id
     where sp.created_by_org_id = p_org_id
       and sp.edition_id = v_oe.edition_id
     order by se.title_de nulls last, pe.last_name, pe.first_name;
end $$;
revoke execute on function partner_speakers(uuid, uuid) from public, anon;
grant execute on function partner_speakers(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- 2) Schreiben

-- Whitelist wie im Kopf beschrieben. Zwei Tabellen, weil der Name an `person` hängt und die
-- Biografie am Profil — für den Partner ist das ein Formular.
create or replace function partner_update_speaker(p_profile_id uuid, p_fields jsonb)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_sp speaker_profile%rowtype; v_bad text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if v_sp.created_by_org_id is null or not partner_can_edit(v_sp.created_by_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Das Flag ist die eigentliche Grenze. Es fällt beim ersten Login der Speakerin und bei
  -- einer bloß per Mailadresse zugeordneten Person stand es nie — in beiden Fällen sind die
  -- Angaben nicht die des Partners.
  if not v_sp.partner_editable_until_login then
    raise exception 'speaker_not_editable' using errcode = 'P0001', detail = p_profile_id::text;
  end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('first_name','last_name','title','job_title','organization_name',
                   'bio_short_de','bio_short_en','bio_long_de','bio_long_en',
                   'linkedin_url','socials');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  update speaker_profile set
    job_title         = case when p_fields ? 'job_title'         then nullif(btrim(p_fields->>'job_title'), '')         else job_title end,
    organization_name = case when p_fields ? 'organization_name' then nullif(btrim(p_fields->>'organization_name'), '') else organization_name end,
    bio_short_de      = case when p_fields ? 'bio_short_de'      then nullif(btrim(p_fields->>'bio_short_de'), '')      else bio_short_de end,
    bio_short_en      = case when p_fields ? 'bio_short_en'      then nullif(btrim(p_fields->>'bio_short_en'), '')      else bio_short_en end,
    bio_long_de       = case when p_fields ? 'bio_long_de'       then nullif(btrim(p_fields->>'bio_long_de'), '')       else bio_long_de end,
    bio_long_en       = case when p_fields ? 'bio_long_en'       then nullif(btrim(p_fields->>'bio_long_en'), '')       else bio_long_en end,
    socials           = case when p_fields ? 'socials' and jsonb_typeof(p_fields->'socials') = 'object'
                             then p_fields->'socials' else socials end
  where id = v_sp.id;

  update person set
    first_name   = case when p_fields ? 'first_name'   then nullif(btrim(p_fields->>'first_name'), '')   else first_name end,
    last_name    = case when p_fields ? 'last_name'    then nullif(btrim(p_fields->>'last_name'), '')    else last_name end,
    title        = case when p_fields ? 'title'        then nullif(btrim(p_fields->>'title'), '')        else title end,
    linkedin_url = case when p_fields ? 'linkedin_url' then nullif(btrim(p_fields->>'linkedin_url'), '') else linkedin_url end
  where id = v_sp.person_id;

  -- Fremde Stammdaten, geändert von jemand anderem als der Person selbst: das gehört ins
  -- Protokoll, mit der Organisation, nicht nur mit der handelnden Person.
  perform log_audit('partner.speaker_update', 'speaker_profile', v_sp.id::text, null,
                    jsonb_build_object('org_id', v_sp.created_by_org_id,
                                       'fields', (select array_agg(k) from jsonb_object_keys(p_fields) k)));
end $$;
revoke execute on function partner_update_speaker(uuid, jsonb) from public, anon;
grant execute on function partner_update_speaker(uuid, jsonb) to authenticated;

comment on function partner_update_speaker(uuid, jsonb) is
  'Der Partner pflegt die Programmangaben eines Speakers, den er selbst eingetragen hat (PART-044) — nur solange `partner_editable_until_login` gilt, danach P0001 `speaker_not_editable`. Private Felder (Telefon, Pronomen, Assistenzkontakt, Technikbedarf, Anredesprache) bleiben außen vor.';

select harden_definer_functions();
