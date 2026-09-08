-- =============================================================================
-- 0011 · v2 Vokabular-Seeds + FLS27-Startdaten (idempotent)
--   Vokabulare für Rollen, Scopes, Programm, Bewerbung, Consent, Portale;
--   Ergänzungen bestehender Vokabulare (contact_role + shop, registration_status
--   + cancelled, format_tag + edition/hackathon/…);
--   Edition FLS27 (Summit 27 am 16./17.04.2027, Hackathon 27 am 15./16.04.2027)
--   mit Tagen und den fünf Bühnen 2027 (ohne ZEIT, Antwort 74);
--   Fragenkatalog-Grundstock; Mail-Templates test/welcome DE+EN.
-- =============================================================================
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  -- role
  ('role','talent','Talent','Talent',1),
  ('role','speaker','Speaker','Speaker',2),
  ('role','speaker_assistant','Speaker-Assistenz','Speaker assistant',3),
  ('role','speaker_manager','Speaker-Manager','Speaker manager',4),
  ('role','partner_contact','Partner-Kontakt','Partner contact',5),
  ('role','standbuehne_editor','Standbühnen-Editor','Booth stage editor',6),
  ('role','volunteer','Volunteer','Volunteer',7),
  ('role','volunteer_lead','Volunteer-Lead','Volunteer lead',8),
  ('role','checkin_operator','Check-in (Kiosk)','Check-in operator',9),
  ('role','production_team','Produktionsteam','Production team',10),
  ('role','programme_team','Programm-Team','Programme team',11),
  ('role','area_lead_talent','Bereichslead Talent','Area lead talent',12),
  ('role','area_lead_speaker','Bereichslead Speaker','Area lead speaker',13),
  ('role','area_lead_partner','Bereichslead Partner','Area lead partner',14),
  ('role','area_lead_volunteers','Bereichslead Volunteers','Area lead volunteers',15),
  ('role','area_lead_hackathon','Bereichslead Hackathon','Area lead hackathon',16),
  ('role','area_lead_production','Bereichslead Produktion','Area lead production',17),
  ('role','admin','Admin','Admin',18),
  -- scope_type
  ('scope_type','global','Global','Global',1),
  ('scope_type','edition','Edition','Edition',2),
  ('scope_type','portal','Portal/Bereich','Portal / area',3),
  ('scope_type','org','Organisation','Organisation',4),
  ('scope_type','stage','Bühne','Stage',5),
  ('scope_type','stage_day','Bühne × Tag','Stage × day',6),
  ('scope_type','slot','Slot','Slot',7),
  -- portal (für scope_type = portal und Bereichs-Umschalter)
  ('portal','talent','Talent','Talent',1),
  ('portal','speaker','Speaker','Speaker',2),
  ('portal','speaker_leads','Speaker-Leads','Speaker leads',3),
  ('portal','partner','Partner','Partner',4),
  ('portal','volunteers','Volunteers','Volunteers',5),
  ('portal','hackathon','Hackathon','Hackathon',6),
  ('portal','produktion','Produktion','Production',7),
  ('portal','programm','Programm','Programme',8),
  ('portal','admin','Admin','Admin',9),
  -- contact_role: Ergänzung (Antwort 7)
  ('contact_role','shop','Shop','Shop',6),
  -- organization_type
  ('organization_type','corporate','Unternehmen','Corporate',1),
  ('organization_type','startup','Startup','Startup',2),
  ('organization_type','initiative','Initiative','Initiative',3),
  ('organization_type','university','Hochschule','University',4),
  ('organization_type','agency','Agentur','Agency',5),
  ('organization_type','media','Medien','Media',6),
  ('organization_type','public','Öffentliche Einrichtung','Public institution',7),
  -- slot_status (Antwort 72: Farbe nur aus Status)
  ('slot_status','open','Offen','Open',1),
  ('slot_status','requested','Angefragt','Requested',2),
  ('slot_status','confirmed_title_open','Bestätigt, Titel offen','Confirmed, title pending',3),
  ('slot_status','final','Final','Final',4),
  ('slot_status','unused','Nicht bespielt','Not used',5),
  -- slot_type
  ('slot_type','content','Programmpunkt','Content',1),
  ('slot_type','fixed_block','Fixblock (Opening/Closing)','Fixed block',2),
  ('slot_type','placeholder','Platzhalter','Placeholder',3),
  ('slot_type','partner_block','Partner-Slot','Partner block',4),
  ('slot_type','frame','Rahmen (Einlass/Ende)','Frame',5),
  -- session_format (aus Master-Programm FLS26 + Side-Formate)
  ('session_format','keynote','Keynote','Keynote',1),
  ('session_format','panel','Panel','Panel',2),
  ('session_format','fireside_chat','Fireside Chat','Fireside chat',3),
  ('session_format','interview','Interview','Interview',4),
  ('session_format','podcast','Podcast','Podcast',5),
  ('session_format','impulse','Impuls','Impulse',6),
  ('session_format','talk','Talk','Talk',7),
  ('session_format','pitch_battle','Pitch Battle','Pitch battle',8),
  ('session_format','award','Award','Award',9),
  ('session_format','opening','Opening','Opening',10),
  ('session_format','closing','Closing','Closing',11),
  ('session_format','masterclass','Masterclass','Masterclass',12),
  ('session_format','company_tour','Company Tour','Company tour',13),
  ('session_format','workshop','Workshop','Workshop',14),
  ('session_format','networking','Networking','Networking',15),
  ('session_format','reception','Reception','Reception',16),
  ('session_format','side_event','Side-Event','Side event',17),
  ('session_format','break','Pause/Umbau','Break',18),
  -- access_mode
  ('access_mode','open','Offen (hingehen)','Open',1),
  ('access_mode','registration','Anmeldung','Registration',2),
  ('access_mode','application','Bewerbung','Application',3),
  -- application_status
  ('application_status','applied','Beworben','Applied',1),
  ('application_status','shortlisted','Shortlist','Shortlisted',2),
  ('application_status','accepted','Zugesagt','Accepted',3),
  ('application_status','confirmed','Bestätigt','Confirmed',4),
  ('application_status','attended','Teilgenommen','Attended',5),
  ('application_status','no_show','Nicht erschienen','No-show',6),
  ('application_status','waitlisted','Warteliste','Waitlisted',7),
  ('application_status','promoted','Nachgerückt','Promoted',8),
  ('application_status','declined','Abgesagt','Declined',9),
  ('application_status','expired','Verfallen','Expired',10),
  ('application_status','withdrawn','Zurückgezogen','Withdrawn',11),
  -- registration_status: Ergänzung
  ('registration_status','cancelled','Storniert','Cancelled',8),
  -- format_tag: Ergänzungen
  ('format_tag','edition','Edition (Klammer)','Edition',0),
  ('format_tag','hackathon','Hackathon','Hackathon',8),
  ('format_tag','masterclass','Masterclass','Masterclass',9),
  ('format_tag','company_tour','Company Tour','Company tour',10),
  ('format_tag','side_event','Side-Event','Side event',11),
  ('format_tag','community','Community-Event','Community event',12),
  -- consent_type
  ('consent_type','terms','Teilnahmebedingungen/AGB','Terms of participation',1),
  ('consent_type','privacy','Datenschutzerklärung','Privacy policy',2),
  ('consent_type','photo_video','Foto- und Videoaufnahmen','Photo & video',3),
  ('consent_type','newsletter','Newsletter','Newsletter',4),
  ('consent_type','share_with_partner','Weitergabe an Host-Partner','Share with host partner',5),
  ('consent_type','speaker_release','Speaker-Freigabe (Name/Bild/Bio)','Speaker release',6),
  ('consent_type','slides_publication','Veröffentlichung der Slides','Slides publication',7),
  ('consent_type','hospitality_data','Reisedaten für Hotel/Shuttle','Hospitality data',8),
  -- language
  ('language','de','Deutsch','German',1),
  ('language','en','Englisch','English',2),
  ('language','mixed','Gemischt','Mixed',3),
  -- stage_type
  ('stage_type','main','Main Stage','Main stage',1),
  ('stage_type','side','Side Stage','Side stage',2),
  ('stage_type','partner_booth','Standbühne (Partner)','Partner booth stage',3),
  ('stage_type','room','Raum (Masterclass)','Room',4),
  -- publish_status
  ('publish_status','draft','Entwurf','Draft',1),
  ('publish_status','review','In Prüfung','In review',2),
  ('publish_status','published','Veröffentlicht','Published',3),
  ('publish_status','cancelled','Abgesagt','Cancelled',4)
on conflict (vocabulary, key) do update
  set label_de = excluded.label_de, label_en = excluded.label_en, sort_order = excluded.sort_order, active = true;

-- === Fragenkatalog-Grundstock ===============================================
insert into question_catalog (key, label_de, label_en, help_de, help_en, type, sort_order) values
  ('motivation','Warum möchtest du teilnehmen?','Why do you want to join?','2–3 Sätze reichen.','Two or three sentences are enough.','textarea',1),
  ('expectations','Was möchtest du mitnehmen?','What do you want to take away?',null,null,'textarea',2),
  ('linkedin','LinkedIn-Profil','LinkedIn profile',null,null,'url',3),
  ('cv_upload','Lebenslauf (PDF)','CV (PDF)','Nur wenn der Partner es verlangt.','Only if the host requires it.','file',4)
on conflict (key) do update
  set label_de = excluded.label_de, label_en = excluded.label_en, help_de = excluded.help_de,
      help_en = excluded.help_en, type = excluded.type, sort_order = excluded.sort_order;

-- === Mail-Templates (Grundstock; Texte werden in Welle 1 finalisiert) =======
insert into mail_template (key, locale, subject, body_md, description) values
  ('test','de','Testmail vom ChefTreff-Portal','Hallo {{first_name}},\n\ndas ist eine Testmail aus dem Portal. Wenn du sie liest, funktioniert der Versand.\n\nViele Grüße\nChefTreff','Technischer Test'),
  ('test','en','Test mail from the ChefTreff portal','Hi {{first_name}},\n\nthis is a test mail from the portal. If you can read it, sending works.\n\nBest\nChefTreff','Technical test'),
  ('welcome','de','Willkommen im ChefTreff-Portal','Hallo {{first_name}},\n\ndein Profil ist angelegt. Über {{portal_url}} kommst du jederzeit zurück.\n\nViele Grüße\nChefTreff','Nach erstem Login'),
  ('welcome','en','Welcome to the ChefTreff portal','Hi {{first_name}},\n\nyour profile is set up. You can come back any time via {{portal_url}}.\n\nBest\nChefTreff','After first login')
on conflict (key, locale) do nothing;

-- === Edition FLS27 mit Events, Tagen und Bühnen (idempotent über slug) ======
do $$
declare
  v_ed uuid; v_summit uuid; v_hack uuid;
  v_fri uuid; v_sat uuid;
  r record;
begin
  insert into event (name, slug, format_tag, is_edition, start_date, end_date, status, venue)
    values ('FLS27', 'fls27', 'edition', true, '2027-04-15', '2027-04-17', 'planning', 'Hamburg')
  on conflict (slug) where slug is not null do nothing;
  select id into v_ed from event where slug = 'fls27';

  insert into event (name, slug, format_tag, edition_id, start_date, end_date, status, venue)
    values ('Future Leader Summit 2027', 'summit-27', 'summit', v_ed, '2027-04-16', '2027-04-17', 'planning', 'CCH Congress Center Hamburg')
  on conflict (slug) where slug is not null do nothing;
  select id into v_summit from event where slug = 'summit-27';

  insert into event (name, slug, format_tag, edition_id, start_date, end_date, status)
    values ('AI Hackathon 2027', 'hackathon-27', 'hackathon', v_ed, '2027-04-15', '2027-04-16', 'planning')
  on conflict (slug) where slug is not null do nothing;
  select id into v_hack from event where slug = 'hackathon-27';

  insert into event_day (event_id, day_date, label_de, label_en, sort_order) values
    (v_summit, '2027-04-16', 'Freitag', 'Friday', 1),
    (v_summit, '2027-04-17', 'Samstag', 'Saturday', 2),
    (v_hack,   '2027-04-15', 'Tag 1', 'Day 1', 1),
    (v_hack,   '2027-04-16', 'Tag 2', 'Day 2', 2)
  on conflict (event_id, day_date) do nothing;
  select id into v_fri from event_day where event_id = v_summit and day_date = '2027-04-16';
  select id into v_sat from event_day where event_id = v_summit and day_date = '2027-04-17';

  -- Bühnen 2027 = 2026 ohne ZEIT (Antwort 74); Parameter aus der FLS26-Analyse (Inventar §15)
  insert into stage (event_id, name, slug, type, changeover_min, default_duration_min, sort_order) values
    (v_summit, 'Main Stage',                'main',              'main', 0, 30, 1),
    (v_summit, 'Leadership & Growth Stage', 'leadership-growth', 'side', 5, 25, 2),
    (v_summit, 'Industry Stage',            'industry',          'side', 0, 30, 3),
    (v_summit, 'Startup Stage',             'startup',           'side', 0, 30, 4),
    (v_summit, 'Impact & Tech Stage',       'impact-tech',       'side', 0, 30, 5)
  on conflict (event_id, slug) do nothing;

  for r in select id from stage where event_id = v_summit loop
    insert into stage_day (stage_id, event_day_id) values (r.id, v_fri), (r.id, v_sat)
    on conflict (stage_id, event_day_id) do nothing;
  end loop;
end $$;
