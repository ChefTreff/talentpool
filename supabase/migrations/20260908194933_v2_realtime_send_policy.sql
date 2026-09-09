-- =============================================================================
-- 0017 · Realtime: Programm-Leser dürfen auf Board-Kanälen auch senden
--   Befund: realtime.messages hat ohne aktiven Realtime-Client keine Partitionen,
--   realtime.send() aus Triggern schlägt dann stumm fehl (Warnung). Als Fallback
--   darf der Board-Client nach eigener Änderung ein `changed` senden (privater
--   Kanal, nur Programm-Leser). Sobald Realtime läuft, kommen beide Wege an.
-- =============================================================================
set search_path = public, extensions;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    begin
      execute 'drop policy if exists programme_board_send on realtime.messages';
      execute $p$create policy programme_board_send on realtime.messages
                for insert to authenticated
                with check (realtime.topic() like 'programme-board:%' and public.is_programme_reader())$p$;
    exception when others then
      raise notice 'realtime.messages insert policy nicht angelegt: %', sqlerrm;
    end;
  end if;
end $$;

select harden_definer_functions();
