create or replace function award_windows(p_edition_id uuid)
 RETURNS TABLE(apply_until timestamp with time zone, vote_from timestamp with time zone, vote_until timestamp with time zone, apply_open boolean, vote_open boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  with d as (
    select (select due_at from deadline where edition_id = p_edition_id and key = 'award_apply_until') as au,
           (select due_at from deadline where edition_id = p_edition_id and key = 'award_vote_from')   as vf,
           (select due_at from deadline where edition_id = p_edition_id and key = 'award_vote_until')  as vu
  )
  -- Ohne Frist ist zu: eine fehlende Zeile darf keine offene Abstimmung bedeuten.
  select au, vf, vu, coalesce(now() <= au, false), coalesce(now() >= vf and now() <= vu, false) from d
$$;
