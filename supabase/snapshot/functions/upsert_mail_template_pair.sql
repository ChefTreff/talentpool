create or replace function upsert_mail_template_pair(p_key text, p_de jsonb, p_en jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_de integer; v_en integer;
begin
  if nullif(btrim(coalesce(p_key, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if not can_edit_mail_template(p_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_de is null and p_en is null then raise exception 'fields_required' using errcode = '22023', detail = 'de/en'; end if;
  -- Je Sprache derselbe Weg wie bei einer einzelnen Vorlage (Version, Protokoll); ein Fehler in einer Sprache
  -- bricht die Funktion ab und mit ihr die Transaktion — es wird nie nur eine Sprache geschrieben.
  if p_de is not null then
    v_de := upsert_mail_template(p_de || jsonb_build_object('key', p_key, 'locale', 'de'));
  end if;
  if p_en is not null then
    v_en := upsert_mail_template(p_en || jsonb_build_object('key', p_key, 'locale', 'en'));
  end if;
  return jsonb_build_object('de', v_de, 'en', v_en);
end $$;
