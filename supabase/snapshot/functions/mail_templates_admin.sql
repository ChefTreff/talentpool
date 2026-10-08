create or replace function mail_templates_admin(p_category text DEFAULT NULL::text)
 RETURNS TABLE(key text, category text, name_de text, name_en text, variables text[], description text, de jsonb, en jsonb, queued integer, sent_30d integer, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_cat text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if v_cat is not null and not is_vocab_key('mail_category', v_cat) then
    raise exception 'invalid_category' using errcode = '22023', detail = v_cat;
  end if;
  if not (has_admin_section('mail') or has_admin_section('mailSpeaker') or has_admin_section('mailPartner')
          or has_admin_section('mailParticipants') or has_admin_section('mailVolunteers')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    with schluessel as (
      select t.key as k from mail_template t group by t.key
    )
    select s.k,
           coalesce(mk.category, 'system'),
           coalesce(mk.name_de, s.k), coalesce(mk.name_en, s.k),
           coalesce(mk.variables, '{}'),
           (select t.description from mail_template t where t.key = s.k order by (t.locale = 'de') desc limit 1),
           (select jsonb_build_object('subject', t.subject, 'body_md', t.body_md, 'active', t.active, 'version', t.version,
                                      'updated_at', t.updated_at,
                                      'updated_by_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                                            from person p where p.id = t.updated_by))
              from mail_template t where t.key = s.k and t.locale = 'de'),
           (select jsonb_build_object('subject', t.subject, 'body_md', t.body_md, 'active', t.active, 'version', t.version,
                                      'updated_at', t.updated_at,
                                      'updated_by_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                                            from person p where p.id = t.updated_by))
              from mail_template t where t.key = s.k and t.locale = 'en'),
           (select count(*)::integer from mail_log m where m.template_key = s.k and m.status = 'queued'),
           (select count(*)::integer from mail_log m
             where m.template_key = s.k and m.status in ('sent', 'delivered') and m.queued_at > now() - interval '30 days'),
           coalesce(mk.sort_order, 1000)
      from schluessel s
      left join mail_template_key mk on mk.key = s.k
     where can_edit_mail_template(s.k)
       and (v_cat is null or coalesce(mk.category, 'system') = v_cat)
     order by coalesce(mk.category, 'system'), coalesce(mk.sort_order, 1000), s.k;
end $$;
