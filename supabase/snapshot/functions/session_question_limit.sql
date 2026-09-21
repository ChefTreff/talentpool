create or replace function session_question_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.question_id is null and (
      select count(*) from session_question
      where session_id = new.session_id and question_id is null and id <> new.id) >= 2 then
    raise exception 'max 2 custom questions per session' using errcode = '23514';
  end if;
  return new;
end $$;
