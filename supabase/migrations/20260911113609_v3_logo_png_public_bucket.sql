-- 0057 · Logo-Pflicht in zwei Formaten (Entscheidung Konrad 11.09.): logo_vector nur noch SVG (Website, Drucksachen), neu logo_png (Event-App,
-- Bildschirme); onboarding_status „filled“ braucht beide. Öffentlicher Bucket partner-logos für freigegebene Logos (Swapcard, Website);
-- der Aussteller-Export liefert SVG- und PNG-Pfad samt Asset-ID des PNG.
set search_path = public, extensions;

update deliverable_template
   set label_de = 'Logo als SVG', label_en = 'Logo as SVG',
       description_de = 'Vektordatei im SVG-Format für Website und Drucksachen. Wird nach Prüfung durch das Team veröffentlicht.',
       description_en = 'Vector file in SVG format for the website and print. Published after review by the team.',
       file_rules = '{"ext": ["svg"], "mime": ["image/svg+xml"], "max_bytes": 20971520}'::jsonb
 where key = 'logo_vector';

insert into deliverable_template (key, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, audience_roles, sort, active)
select 'logo_png', 'upload', 'Logo als PNG', 'Logo as PNG',
       'PNG mit transparentem Hintergrund, mindestens 1000 Pixel breit — für die Event-App und Bildschirme.',
       'PNG with a transparent background, at least 1000 pixels wide — for the event app and screens.',
       '{}'::jsonb, '{"ext": ["png"], "mime": ["image/png"], "max_bytes": 10485760}'::jsonb, true, '{primary_ops,additional}', 11, true
 where not exists (select 1 from deliverable_template where key = 'logo_png');

-- Bestehende Organisationen laufender Editionen bekommen die neue Pflicht sofort
do $$
declare r record;
begin
  for r in select oe.id from org_edition oe join event e on e.id = oe.edition_id where coalesce(e.end_date, current_date) >= current_date loop
    perform sync_deliverables(r.id);
  end loop;
end $$;

create or replace function partner_onboarding_recheck(p_org_edition_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_o organization%rowtype;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return null; end if;
  select * into v_o from organization where id = v_oe.org_id;
  if v_oe.onboarding_status in ('none', 'invited')
     and coalesce(v_o.legal_name, '') <> '' and coalesce(v_o.communication_name, '') <> '' and coalesce(v_o.address_street, '') <> ''
     and coalesce(v_o.address_zip, '') <> '' and coalesce(v_o.address_city, '') <> '' and v_oe.invoice_email is not null and coalesce(v_oe.description_de, '') <> ''
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_vector' and a.is_current)
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_png' and a.is_current) then
    update org_edition set onboarding_status = 'filled', onboarding_filled_at = now() where id = v_oe.id;
    return 'filled';
  end if;
  return v_oe.onboarding_status;
end $$;

-- Öffentlicher Bucket für freigegebene Logos: Lesen über die öffentliche URL, Schreiben nur service_role (keine Policies für anon/authenticated)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-logos', 'partner-logos', true, 20971520, array['image/png', 'image/svg+xml'])
on conflict (id) do nothing;

drop function if exists event_app_exhibitors(uuid);
create function event_app_exhibitors(p_edition_id uuid default null)
returns table (org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text,
               description_de text, description_en text, website text, sponsoring_level text, partner_category text, org_type text, booth_number text,
               onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
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
           (select a.storage_path from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_png' and d.status = 'accepted' order by a.version desc limit 1),
           (select a.id from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_png' and d.status = 'accepted' order by a.version desc limit 1),
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

select harden_definer_functions();
