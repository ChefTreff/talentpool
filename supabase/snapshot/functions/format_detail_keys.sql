create or replace function format_detail_keys(p_format text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case p_format
    when 'side_event' then array['location_text', 'image_asset_id']
    when 'interview_table' then array['job_title', 'job_posting_text', 'job_posting_url',
                                      'target_profile', 'interview_mode']
    -- PART-054: ob der Partner Goodies einsendet — eine Angabe fürs Team, nicht fürs Programm.
    when 'masterclass' then array['goodies_planned']
    -- `company_tour` fehlt mit Absicht: seit Konrads Entscheidung D5 (18.09.) hat sie ein
    -- eigenes Datenmodell mit Touren und Stopps; die Angaben des Partners gehören an seinen
    -- Stopp, nicht an die Session.
    else array[]::text[] end
$$;
