-- 0063 · Grants aufräumen (Funde Build-Session PR #19): admin_products nur noch Partner-Team (Einkaufsdaten: Einkaufspreis, Marge, Lieferant, interner Kommentar);
-- anon verliert alle Tabellen- und Sicht-Grants aus dem pauschalen „grant all“ der Welle 1 (bleibt: select auf vocab_term, einzige anon-Policy);
-- authenticated verliert tote Schreib-Grants auf Tabellen ohne Schreib-Policy und Lese-Grants auf Tabellen ohne Lese-Policy.
-- Verhalten unverändert — RLS ist auf jeder Tabelle aktiv und hat das alles schon verweigert; der Grundsatz „Spalten-Grants“ gilt wieder.
set search_path = public, extensions;

create or replace function admin_products(p_only_active boolean default false) returns setof product
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.* from product p
    where (not p_only_active or p.active)
    order by p.category, p.shop_sort nulls last, p.name_de;
end $$;

-- anon: nichts außer dem Vokabular lesen
revoke all on application from anon; revoke all on audit_log from anon; revoke all on checkin from anon; revoke all on consent_current from anon;
revoke all on consent_record from anon; revoke all on decision_release from anon; revoke all on event from anon; revoke all on event_day from anon;
revoke all on mail_log from anon; revoke all on mail_template from anon; revoke all on org_membership from anon; revoke all on organization from anon;
revoke all on person from anon; revoke all on person_acquisition_channel from anon; revoke all on person_eligibility from anon; revoke all on person_email from anon;
revoke all on person_interest from anon; revoke all on person_lifecycle from anon; revoke all on person_lifecycle_current from anon; revoke all on person_merge_log from anon;
revoke all on potential_duplicate from anon; revoke all on programme_backlog from anon; revoke all on programme_board from anon; revoke all on programme_public from anon;
revoke all on question_catalog from anon; revoke all on registration from anon; revoke all on role_assignment from anon; revoke all on session from anon;
revoke all on session_question from anon; revoke all on session_speaker from anon; revoke all on slot from anon; revoke all on slot_history from anon;
revoke all on staff_user from anon; revoke all on stage from anon; revoke all on stage_day from anon; revoke all on stage_day_slot_stats from anon;
revoke all on suppression from anon; revoke all on ticket from anon; revoke all on track from anon;
revoke insert, update, delete on vocab_term from anon;

-- authenticated: Schreib-Grants ohne Schreib-Policy (Schreiben läuft über SECURITY-DEFINER-RPCs)
revoke delete, insert, update on application from authenticated; revoke delete, insert, update on audit_log from authenticated;
revoke delete, insert, update on checkin from authenticated; revoke delete, insert, update on consent_current from authenticated;
revoke delete, update on consent_record from authenticated; revoke delete, insert, update on decision_release from authenticated;
revoke delete, insert, update on event from authenticated; revoke delete, insert, update on event_day from authenticated;
revoke delete, insert, update on mail_log from authenticated; revoke delete, insert, update on mail_template from authenticated;
revoke delete, insert on person from authenticated; revoke update on person_acquisition_channel from authenticated;
revoke delete, insert, update on person_eligibility from authenticated; revoke delete, insert, update on person_email from authenticated;
revoke update on person_interest from authenticated; revoke delete, insert, update on person_lifecycle from authenticated;
revoke delete, insert, update on person_lifecycle_current from authenticated; revoke delete, insert, update on person_merge_log from authenticated;
revoke delete, insert, update on potential_duplicate from authenticated; revoke delete, insert, update on programme_backlog from authenticated;
revoke delete, insert, update on programme_board from authenticated; revoke delete, insert, update on programme_public from authenticated;
revoke delete, insert, update on question_catalog from authenticated; revoke delete, insert, update on registration from authenticated;
revoke delete, insert, update on role_assignment from authenticated; revoke delete, insert, update on session from authenticated;
revoke delete, insert, update on session_question from authenticated; revoke delete, insert, update on session_speaker from authenticated;
revoke delete, insert, update on slot from authenticated; revoke delete, insert, update on slot_history from authenticated;
revoke delete, insert, update on staff_user from authenticated; revoke delete, insert, update on stage from authenticated;
revoke delete, insert, update on stage_day from authenticated; revoke delete, insert, update on stage_day_slot_stats from authenticated;
revoke delete, insert, update on suppression from authenticated; revoke delete, insert, update on ticket from authenticated;
revoke delete, insert, update on track from authenticated; revoke delete, insert, update on vocab_term from authenticated;

-- authenticated: Lese-Grants ohne Lese-Policy (das Team liest über RPCs)
revoke select on audit_log, mail_log, mail_template, org_membership, organization, person_merge_log, potential_duplicate, staff_user, suppression, ticket_type_map from authenticated;

select harden_definer_functions();
