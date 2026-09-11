-- 0055 · Welle 3 A12: Event-App-Adapter (Swapcard 2027). Event-ID je Edition in der DB (wie vivenu/HubSpot, Entscheidung „IDs in event statt Env“),
-- Aussteller-Export für den Adapter (service_role oder Partner-Team), Referenz Swapcard-Aussteller ↔ org_edition in external_ref.
set search_path = public, extensions;

alter table event add column if not exists swapcard_event_id text;
comment on column event.swapcard_event_id is 'Swapcard-Event der Edition (Content-API); gesetzt über set_edition_swapcard. Ohne Wert überträgt der Adapter nichts.';

create or replace function set_edition_swapcard(p_edition_id uuid, p_swapcard_event_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update event set swapcard_event_id = nullif(btrim(coalesce(p_swapcard_event_id, '')), '') where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  perform log_audit('edition.swapcard', 'event', p_edition_id::text, null, jsonb_build_object('swapcard_event_id', p_swapcard_event_id));
end $$;

-- Aussteller je Edition: Name/Beschreibung/Website aus Org + Edition, freigegebenes Vektor-Logo (aktuelle Fassung der akzeptierten Pflicht logo_vector),
-- Standnummer, Sponsoring-Level (Logo-Typ in der App), Kontakte mit Rolle event_app_member, gespeicherte Swapcard-ID.
create or replace function event_app_exhibitors(p_edition_id uuid default null)
returns table (org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text,
               description_de text, description_en text, website text, sponsoring_level text, partner_category text, org_type text, booth_number text,
               onboarding_status text, logo_path text, logo_mime text, swapcard_exhibitor_id text, members jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, e.id, e.slug, e.swapcard_event_id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.slug,
           coalesce(oe.description_de, o.description), oe.description_en, o.website, oe.sponsoring_level, o.partner_category, o.type,
           (select b.booth_number from booth b where b.org_edition_id = oe.id order by b.created_at limit 1),
           oe.onboarding_status,
           (select a.storage_path from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_vector' and d.status = 'accepted' order by a.version desc limit 1),
           (select a.mime from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_vector' and d.status = 'accepted' order by a.version desc limit 1),
           (select r.external_id from external_ref r where r.system = 'swapcard' and r.object_type = 'exhibitor' and r.object_id = oe.id),
           coalesce((select jsonb_agg(jsonb_build_object('person_id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
                                                         'email', pe.email::text, 'position', m.contact_position)
                                      order by p.last_name, p.first_name)
                     from org_membership m
                     join person p on p.id = m.person_id and p.deleted_at is null
                     left join person_email pe on pe.person_id = p.id and pe.is_primary
                     where m.org_id = o.id and m.roles @> '{event_app_member}'), '[]'::jsonb)
    from org_edition oe
    join organization o on o.id = oe.org_id
    join event e on e.id = oe.edition_id
    where o.active
      and (p_edition_id is null or oe.edition_id = p_edition_id)
      and (p_edition_id is not null or e.swapcard_event_id is not null)
    order by e.slug, coalesce(o.communication_name, o.legal_name);
end $$;

-- Referenz Aussteller-ID der App ↔ org_edition (ein Eintrag je Org und Edition; neue ID überschreibt)
create or replace function set_event_app_ref(p_org_edition_id uuid, p_system text, p_external_id text, p_meta jsonb default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('swapcard') then raise exception 'invalid_system' using errcode = '22023', detail = p_system; end if;
  if nullif(btrim(coalesce(p_external_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;
  if not exists (select 1 from org_edition where id = p_org_edition_id) then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values (p_system, 'exhibitor', p_org_edition_id, btrim(p_external_id), coalesce(p_meta, '{}'::jsonb))
  on conflict (system, object_type, object_id) do update set external_id = excluded.external_id, meta = excluded.meta, updated_at = now();
end $$;

select harden_definer_functions();
