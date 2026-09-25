create or replace function upsert_edition_contact(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_ed uuid; v_typ text; v_mail text; v_consent date; v_mail_effektiv text;
        v_typ_alt text; v_typ_wirksam text;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy','tour_lead') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  -- ADM-059: Wer nur den Abschnitt „Company Tours" hat, darf **Begleitungen**
  -- pflegen und sonst nichts. Die Regeln dafuer (Pflichtfelder, Einwilligung bei
  -- fremder Adresse, Standard-Eindeutigkeit) stehen genau einmal — hier —, statt
  -- in einer zweiten Funktion daneben, wo sie auseinanderlaufen wuerden.
  --
  -- Der **wirksame** Typ zaehlt: beim Aendern der bestehende, wenn keiner
  -- mitkommt. Und der bisherige muss ebenfalls `tour_lead` sein — sonst koennte
  -- jemand eine Begleitung anlegen und sie danach in einen Speaker-Buddy
  -- verwandeln, also ueber den Umweg genau das pflegen, was ihm verwehrt ist.
  if v_id is not null then
    select c.type into v_typ_alt from edition_contact c where c.id = v_id;
  end if;
  v_typ_wirksam := coalesce(v_typ, v_typ_alt);
  if not can_edit_edition_contacts() then
    if not (coalesce(has_admin_section('companyTours'), false)
            and v_typ_wirksam = 'tour_lead'
            and (v_id is null or v_typ_alt = 'tour_lead')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  v_mail := nullif(btrim(p_data->>'email'), '');
  v_consent := nullif(p_data->>'contract_consent_at', '')::date;

  -- Welche Adresse gilt am Ende, und welches Datum? Beim Ändern zählt der
  -- bestehende Stand, wenn das Feld nicht mitgeschickt wird — sonst würde eine
  -- reine Namenskorrektur an der Einwilligung scheitern.
  if v_id is not null then
    select coalesce(v_mail, c.email::text),
           case when p_data ? 'contract_consent_at' then v_consent else c.contract_consent_at end
      into v_mail_effektiv, v_consent
      from edition_contact c where c.id = v_id;
  else
    v_mail_effektiv := v_mail;
  end if;

  if v_mail_effektiv is not null
     and lower(v_mail_effektiv) not like '%@chef-treff.de'
     and v_consent is null then
    raise exception 'contact_consent_required' using errcode = '22023', detail = v_mail_effektiv;
  end if;

  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;

  -- **Erst umhängen, dann schreiben.** Der Teilindex `edition_contact_default_uidx`
  -- duldet keinen zweiten Standard je Edition und Typ — auch nicht für die
  -- Dauer einer Anweisung.
  if coalesce((p_data->>'is_default')::boolean, false) then
    update edition_contact set is_default = false, updated_at = now()
     where edition_id = v_ed
       and type = coalesce(v_typ, (select c.type from edition_contact c where c.id = v_id))
       and is_default
       and (v_id is null or id <> v_id);
  end if;

  if v_id is null then
    if v_typ is null or nullif(btrim(p_data->>'display_name'), '') is null
       or v_mail is null or nullif(btrim(p_data->>'phone'), '') is null then
      raise exception 'fields_required' using errcode = '22023',
        detail = 'type, display_name, email und phone sind Pflicht';
    end if;
    insert into edition_contact (edition_id, type, display_name, role_label_de, role_label_en,
                                 email, phone, photo_path, is_default, sort_order, contract_consent_at)
    values (v_ed, v_typ, btrim(p_data->>'display_name'),
            nullif(btrim(p_data->>'role_label_de'), ''), nullif(btrim(p_data->>'role_label_en'), ''),
            v_mail::citext, btrim(p_data->>'phone'),
            nullif(btrim(p_data->>'photo_path'), ''),
            coalesce((p_data->>'is_default')::boolean, false),
            coalesce((p_data->>'sort_order')::integer, 0), v_consent)
    returning id into v_id;
  else
    update edition_contact set
      type          = coalesce(v_typ, type),
      display_name  = coalesce(nullif(btrim(p_data->>'display_name'), ''), display_name),
      role_label_de = case when p_data ? 'role_label_de' then nullif(btrim(p_data->>'role_label_de'), '') else role_label_de end,
      role_label_en = case when p_data ? 'role_label_en' then nullif(btrim(p_data->>'role_label_en'), '') else role_label_en end,
      email         = coalesce(v_mail::citext, email),
      phone         = coalesce(nullif(btrim(p_data->>'phone'), ''), phone),
      photo_path    = case when p_data ? 'photo_path' then nullif(btrim(p_data->>'photo_path'), '') else photo_path end,
      is_default    = coalesce((p_data->>'is_default')::boolean, is_default),
      sort_order    = coalesce((p_data->>'sort_order')::integer, sort_order),
      contract_consent_at = case when p_data ? 'contract_consent_at' then v_consent else contract_consent_at end,
      updated_at    = now()
     where id = v_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;

  perform log_audit('edition_contact.upsert', 'edition_contact', v_id::text, null, p_data - 'photo_path');
  return v_id;
end $$;
