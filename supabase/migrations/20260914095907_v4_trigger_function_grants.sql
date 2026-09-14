-- 0086 · Trigger-Funktionen ohne EXECUTE für authenticated (Security-Check nach der Pause, 14.09.2026).
-- Der Supabase-Advisor listet sieben Trigger-Funktionen aus den Wellen 1–2, die `authenticated` „ausführen" dürfte
-- (`application_mail_trigger`, `decision_release_mail_trigger`, `registration_mail_trigger`, `speaker_profile_tickets_sync`
-- als SECURITY DEFINER; `enforce_primary_email`, `set_updated_at`, `speaker_profile_check` als INVOKER). Ausnutzbar ist das
-- nicht — eine Funktion mit Rückgabetyp `trigger` lässt sich nicht direkt aufrufen —, aber es widerspricht der Konvention
-- (`docs/db-konventionen.md` §2/§4: Trigger-Funktionen `revoke execute … from public, anon, authenticated`). Die Trigger
-- selbst laufen als Eigentümer weiter; an ihrem Verhalten ändert sich nichts.
-- Abweichungen: keine.
set search_path = public, extensions;

revoke execute on function application_mail_trigger() from public, anon, authenticated;
revoke execute on function decision_release_mail_trigger() from public, anon, authenticated;
revoke execute on function registration_mail_trigger() from public, anon, authenticated;
revoke execute on function speaker_profile_tickets_sync() from public, anon, authenticated;
revoke execute on function enforce_primary_email() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;
revoke execute on function speaker_profile_check() from public, anon, authenticated;

select harden_definer_functions();
