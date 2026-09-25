create or replace function is_programme_board_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- Wer ein Board vor sich haben kann: Admin, Programm-Team, Stage Leads,
  -- Standbühnen. Nur für `programme-board:*` — die Nachrichten tragen keine Inhalte.
  select is_staff() or has_role('programme_team')
      or has_role('speaker_manager') or has_role('standbuehne_editor')
$$;
