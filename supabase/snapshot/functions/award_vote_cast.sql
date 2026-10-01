create or replace function award_vote_cast(p_application_id uuid, p_ip_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a award_application; v_hash text; v_n integer;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from award_application where id = p_application_id;
  if not found then return 'not_found'; end if;
  if v_a.status not in ('accepted', 'finalist') then return 'not_votable'; end if;
  if not coalesce((select w.vote_open from award_windows(v_a.edition_id) w), false) then return 'closed'; end if;
  v_hash := award_hash(v_a.edition_id, p_ip_hash);
  if v_hash is null then return 'invalid'; end if;
  if (select count(*) from award_vote v where v.voter_hash = v_hash and v.created_at > now() - interval '1 hour') >= 30 then
    return 'rate_limited';
  end if;
  insert into award_vote (application_id, edition_id, voter_hash) values (v_a.id, v_a.edition_id, v_hash)
  on conflict (application_id, voter_hash) do nothing;
  get diagnostics v_n = row_count;
  return case when v_n = 1 then 'ok' else 'duplicate' end;
end $$;
