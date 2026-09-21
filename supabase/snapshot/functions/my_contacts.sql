create or replace function my_contacts(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, type text, display_name text, role_label_de text, role_label_en text, email text, phone text, photo_path text, via text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then return; end if;

  return query
  with partner_zuordnung as (
    select oe.lead_contact_id, oe.buddy_contact_id
      from org_edition oe
     where oe.edition_id = v_ed and is_partner_of(oe.org_id)
  ), speaker_zuordnung as (
    select sp.lead_contact_id, sp.buddy_contact_id
      from speaker_profile sp
     where sp.edition_id = v_ed and sp.id = my_speaker_profile_id(v_ed)
  ), gewaehlt as (
    -- Je Beziehung und Typ: die gesetzte Zuordnung, sonst der Standard.
    select 'partner_lead'::text as typ, coalesce(
             (select pz.lead_contact_id from partner_zuordnung pz where pz.lead_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'partner_lead' and c.is_default)) as kontakt,
           'partner'::text as herkunft
     where exists (select 1 from partner_zuordnung)
    union all
    select 'partner_buddy', coalesce(
             (select pz.buddy_contact_id from partner_zuordnung pz where pz.buddy_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'partner_buddy' and c.is_default)),
           'partner'
     where exists (select 1 from partner_zuordnung)
    union all
    select 'speaker_lead', coalesce(
             (select sz.lead_contact_id from speaker_zuordnung sz where sz.lead_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'speaker_lead' and c.is_default)),
           'speaker'
     where exists (select 1 from speaker_zuordnung)
    union all
    select 'speaker_buddy', coalesce(
             (select sz.buddy_contact_id from speaker_zuordnung sz where sz.buddy_contact_id is not null limit 1),
             (select c.id from edition_contact c where c.edition_id = v_ed and c.type = 'speaker_buddy' and c.is_default)),
           'speaker'
     where exists (select 1 from speaker_zuordnung)
  )
  select distinct on (c.id)
         c.id, c.type, c.display_name, c.role_label_de, c.role_label_en,
         c.email::text, c.phone, c.photo_path, g.herkunft
    from gewaehlt g join edition_contact c on c.id = g.kontakt
   order by c.id, g.herkunft;
end $$;
