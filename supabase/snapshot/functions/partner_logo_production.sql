create or replace function partner_logo_production(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, org_edition_id uuid, org_name text, sponsoring_level text, vektor_datei text, vektor_status text, vektor_seit timestamp with time zone, pixel_datei text, einwilligung timestamp with time zone, druckbar boolean, fehlt text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not has_admin_section('logoWall') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  return query
  with basis as (
    select oe.id as oe_id, oe.org_id, oe.sponsoring_level, oe.logo_whitening_consent_at,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name) as name,
           -- **Left join, nicht join**: ein Partner ohne jede Datei muss in der
           -- Liste stehen, sonst faellt genau er wieder durch.
           (select a.filename from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor,
           (select a.status from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor_status,
           (select a.created_at from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor_seit,
           (select a.filename from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_png' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as pixel
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed
  )
  select b.org_id, b.oe_id, b.name, b.sponsoring_level,
         b.vektor, b.vektor_status, b.vektor_seit, b.pixel, b.logo_whitening_consent_at,
         b.vektor is not null and b.logo_whitening_consent_at is not null,
         -- Sagt, was zu tun ist. Drei Spalten zu lesen und daraus zu schliessen
         -- ist im Druckstress genau die Arbeit, die niemand macht.
         nullif(concat_ws(' · ',
           case when b.vektor is null then 'Vektordatei fehlt' end,
           case when b.logo_whitening_consent_at is null then 'Einwilligung zum Weissen fehlt' end,
           case when b.vektor is not null and b.vektor_status = 'pending' then 'Datei noch ungeprueft' end), '')
    from basis b
   order by b.name;
end $$;
