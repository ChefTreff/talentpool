-- 0102 · Welle 5 · Ansprechpartner: fremde Mail-Domain als eigener Fehlerschlüssel
--
-- Angewendet von der Architektur-Session am 15.09.2026 — Nachtrag zu 0091 nach
-- dem Walkthrough der Build-Session (PR #41).
--
-- Befund: eine Adresse außerhalb von @chef-treff.de scheiterte am CHECK
-- `edition_contact_email_chk` und kam als nacktes 23514 zurück. Die
-- Oberfläche zeigte „constraint_violated", und die Redaktion wusste nicht,
-- dass es an der Mailadresse liegt. Der CHECK bleibt die Schutzlinie; davor
-- prüft `upsert_edition_contact` jetzt selbst und antwortet mit 22023
-- `invalid_email` (Schlüssel steht in BUSINESS_KEYS und beiden Wörterbüchern).
-- Sonst unverändert aus 0091.
--
-- Fehlerschlüssel: 42501 ohne Recht · 22023 `invalid_contact_type` /
-- `fields_required` / `invalid_email` · P0002 `contact_not_found`.

set search_path = public, extensions;

create or replace function upsert_edition_contact(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_ed uuid; v_typ text; v_mail text;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  -- Dienstliche Adresse: vor dem CHECK mit eigenem Schlüssel abweisen, damit
  -- die Redaktion sieht, woran es liegt (Walkthrough 15.09.).
  v_mail := nullif(btrim(p_data->>'email'), '');
  if v_mail is not null and lower(v_mail) not like '%@chef-treff.de' then
    raise exception 'invalid_email' using errcode = '22023', detail = v_mail;
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
                                 email, phone, photo_path, is_default, sort_order)
    values (v_ed, v_typ, btrim(p_data->>'display_name'),
            nullif(btrim(p_data->>'role_label_de'), ''), nullif(btrim(p_data->>'role_label_en'), ''),
            v_mail::citext, btrim(p_data->>'phone'),
            nullif(btrim(p_data->>'photo_path'), ''),
            coalesce((p_data->>'is_default')::boolean, false),
            coalesce((p_data->>'sort_order')::integer, 0))
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
      updated_at    = now()
     where id = v_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;

  perform log_audit('edition_contact.upsert', 'edition_contact', v_id::text, null, p_data - 'photo_path');
  return v_id;
end $$;

select harden_definer_functions();
