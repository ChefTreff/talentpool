# Datenschutz-Checkliste: Verarbeitungen der FLS27-Plattform (Arbeitsstand 21.09.2026)

Zweck: jede Verarbeitung personenbezogener Daten einmal sauber aufgelistet — Grundlage für das Verzeichnis der
Verarbeitungstätigkeiten (Art. 30 DSGVO), die neue Datenschutzerklärung und das Briefing des Consent-Agents.
Gepflegt von der Architektur-/Security-Session; jede neue Tabelle, Integration oder Einwilligung wird hier nachgezogen.
Konrad prüft die Spalten „Rechtsgrundlage" und „Dauer" mit dem Datenschutzberater.

Verantwortlicher: ChefTreff (Hamburg). Speicherort: Supabase-Projekt `jqmqvgaiyjudkvtncijw` (Region Frankfurt),
Dateien in Supabase Storage (Buckets `contact-photos`, `edition-files`, `partner-assets`, `partner-logos`,
`product-images`, `session-assets`, `speaker-assets`). Anwendung auf Vercel (`portal.chef-treff.de`).

Einwilligungstypen im System (`consent_record`/`consent_current`, versioniert): `privacy`/`privacy_policy`, `terms`,
`newsletter`, `photo_video`, `hospitality_data`; **neu geplant:** `event_app` (Weitergabe an die Event-App, Konrad 21.09.).

## 1 · Verarbeitungen

| Nr | Verarbeitung · Zweck | Betroffene | Datenkategorien (Tabellen) | Rechtsgrundlage | Empfänger / Auftragsverarbeiter | Dauer · Löschweg |
|---|---|---|---|---|---|---|
| V1 | **Konto und Login** (Magic Link) · Zugang zu den Portalen | alle Nutzenden | E-Mail, Auth-Kennung, Rollen (`person`, `person_email`, `role_assignment`, `auth.users`) | Vertrag (Art. 6 Abs. 1 b) | Supabase (Auth, DB), Vercel (Hosting), Resend (Mailversand) | bis „Profil löschen" (`anonymize_person`) bzw. Ende der Rolle |
| V2 | **Talent-Bewerbung und Auswahl** · Teilnahme am Summit vergeben | Bewerbende (Talente, Studierende) | Name, Kontakt, Studium/Beruf, Interessen, Motivation, Herkunftskanal, CV/Foto (`application`, `person_interest`, `person_acquisition_channel`, `person_eligibility`, `speaker_asset`-ähnliche Uploads), Einwilligungen (`consent_record`) | Vertrag (Bewerbung), Einwilligung für Newsletter/Foto | Partner sehen im Talentpool nur die Bewerberdaten, die für Interview Tables/Recruiting freigegeben sind (D3: Export nur dieser Felder, mit DSGVO-Hinweis) | Bewerbungszyklus + Aufbewahrung nach Vorgabe (**offen**); „Profil löschen" + `suppression` |
| V3 | **Tickets und Zutritt** · Kauf, Ausgabe, Check-in | Teilnehmende aller Pass-Typen | Name, E-Mail, Pass-Typ, Barcode, Kauf-Kennungen (`ticket`, `ticket_secret`, `ticket_type_map`, `checkin` mit `scan_day`) | Vertrag | vivenu (Shop, Zahlung, Ticket; Webhook signiert), Check-in-App intern | bis Ende der Edition + gesetzliche Fristen (**offen**); externe Löschung bei vivenu binnen 30 Tagen (QS-019) |
| V4 | **Speaker-Onboarding und -Betreuung** · Programm, Reise, Bühne | Speaker, Assistenzen, externe Kontakte (Agentur/Office) | Profil, Bio, Foto, Reise- und Hotelangaben, Spesen, Shuttle-Fahrten, Technik-Ansage, Reception-Zusage inkl. Begleitung, **Ernährung/Gesundheit** (`hospitality_data`, Art. 9), Kontakt ohne Portalzugang mit Einwilligungsdatum (`speaker_profile`, `speaker_travel`, `expense_claim`, `shuttle_booking`, `speaker_reception_rsvp`, `speaker_asset`, `session_speaker`) | Vertrag; **Einwilligung** für Gesundheitsangaben und für Fremdkontakte (`contact_consent_at`) | Speaker-Team und Buddys intern; Shuttle-Unternehmen erhält Export (Name, Zeiten, Orte — ohne Notizen, Begründungen, Mailadressen); Produktion (Regie) sieht Technik-Ansage; Swapcard (Speaker-Profil öffentlich, EA2) | bis Ende der Edition, Reise/Spesen nach Buchhaltungsfristen (**offen**); Profil löschen leert Kontakt- und Profilfelder |
| V5 | **Partner-Portal** · Vertrag, Ansprechpersonen, Leistungen, Belege | Partner-Kontakte, Ansprechpersonen ChefTreff (Team, Buddys, Freelancer), Tour Leads | Name, dienstliche E-Mail und Telefon, Foto (Serviceversprechen 17.09.), Rolle (`edition_contact`, `org_membership`, `person`), Belege/Angebote als PDF, Branding-Dateien (`partner_asset`), Bestellungen Messeshop | Vertrag; Freelancer nur mit Einwilligung im Vertrag (`contract_consent_at`) | HubSpot (Deals, Kontakte — Ingest), SevDesk (Angebote, Rechnungen, Artikel), Partner-Unternehmen sehen ihre Ansprechpersonen | Vertragslaufzeit + Buchhaltungsfristen; Ansprechpersonen bis Rollenende |
| V6 | **Company Tours und Formate** · Stopps, Tour Lead, Interview Tables | Partner-Kontakte, Tour Leads, teilnehmende Talente | Zuordnung Talent ↔ Interview-Tisch/Session, Bewerberdaten je Format (`session`, `session_speaker`, `company_tour*`) | Vertrag | Partner sehen Teilnehmende ihres Formats (nur freigegebene Felder) | wie V2 |
| V7 | **Volunteers** · Einsatzplanung, Crew Pass | Volunteers | Profil, Verfügbarkeit, Einsatz, Coupon (`volunteer_profile`, `volunteer_coupon_revocation`) | Vertrag/Einwilligung (Ehrenamtsvereinbarung) | intern; vivenu (Crew-Ticket); Swapcard (Crew Pass) | bis Ende der Edition |
| V8 | **Hackathon** · Bewerbung, Teams, Einreichung, Bewertung | Hackathon-Teilnehmende, Jury, Challenge-Partner | Bewerbung, Skills, Team, Einreichung, Bewertungen (`hack_application`, `hack_team`, `hack_team_member`, `hack_submission`, `hack_judging_score`) | Vertrag (Teilnahmebedingungen) | Challenge-Partner sehen ihr Team und die Einreichung; Jury intern | bis Ende der Edition + Award-Abstimmung (bis 12.04.2027) |
| V9 | **Kommunikation** · Transaktionsmails, Newsletter, Sperrliste | alle Kontakte | E-Mail, Versandprotokoll (`mail_log`, `mail_template`), Sperrliste (`suppression`, Hash) | Vertrag (Transaktion), Einwilligung (`newsletter`) | Resend (Versand), HubSpot (Marketing, sofern genutzt) | Protokoll nach Frist (**offen**); Sperrliste dauerhaft (berechtigtes Interesse) |
| V10 | **Event-App Swapcard** · Teilnehmerverzeichnis, Programm, Aussteller | Teilnehmende mit Partner-, Student-, Talent-, Professional-, Crew-, Startup-, Investor-, Supporter-Pass; Speaker; Aussteller-Kontakte | Name, E-Mail, Pass-Typ (Gruppe), Organisation/Titel; Speaker-Profil (öffentlich); Sessions (öffentliche Felder); Aussteller (Firmendaten, Level, Branche) | **Einwilligung `event_app`** für Teilnehmende (Konrad 21.09.); Speaker/Sessions: Vertrag, öffentliche Programmdaten | Swapcard (AVV) | bis Ende der Edition; Widerruf/Storno ⇒ Entfernen beim nächsten Lauf; **kein Rückkanal** aus Swapcard (Konrad 21.09.) — Nutzungsdaten werden nur in Swapcard gelesen |
| V11 | **KI-Assistenten** · Wiki-Fragen, Titel-Assistent | Nutzende der Assistenten | Frage- bzw. Formattext und Sprache — **kein Name, keine Kennung, keine Mailadresse** (Unit-Test); Aufrufzähler je Person (`ai_rate_limit`, `kb_rate_limit`) | berechtigtes Interesse / Vertrag | Anthropic (API, AVV auf Checkliste) | Zähler 1 h; keine Speicherung der Anfragen beim Anbieter über die Verarbeitung hinaus (**prüfen: Zero-Data-Retention**) |
| V12 | **Betrieb und Nachweis** · Audit, Sync-Protokolle, Fehler | handelnde Nutzende | wer hat was wann geändert (`audit_log`), Sync-Läufe (`integration.sync_job`, `sync_error`), Server-Logs (IP, Zeit) | berechtigtes Interesse (Sicherheit, Nachweis) | Supabase, Vercel (Logs) | Audit dauerhaft bis Löschung der Person (Verweis bleibt anonym); Logs nach Anbieterfrist (**offen**) |
| V13 | **Altdaten-Migration** · Dublettenabgleich, Übernahme FLS26 | Alt-Kontakte | Staging-Kontakte, Zuordnungen, Merge-Protokoll (`import.staging_contact`, `import.source_person_map`, `potential_duplicate`, `person_merge_log`) | berechtigtes Interesse (Kontinuität) / bestehende Einwilligungen | intern | Staging nach Abschluss der Migration löschen (letzter Schritt laut Masterplan) |

## 2 · Auftragsverarbeiter und Empfänger (AVV-Liste, Abschluss-Checkliste)

Supabase (DB, Auth, Storage — Frankfurt) · Vercel (Hosting, Logs) · Resend (E-Mail) · vivenu (Tickets, Zahlung) ·
Swapcard (Event-App) · HubSpot (CRM) · SevDesk (Buchhaltung) · make.com (Automationen, Basic-Auth entfernen) ·
Google Workspace (Drive-Lesekopie der Doku, Mail) · Anthropic (KI-Assistenten). **Kein** Fremddienst mehr für die
Grafik-Maske (Porträt bleibt im Browser, #85).

## 3 · Rechte der Betroffenen im System

- **Auskunft/Export:** Profil-Export für Talente (JSON), Partner-Export nur freigegebene Bewerberfelder mit DSGVO-Hinweis (D3).
- **Löschen:** „Profil löschen" (`anonymize_person`, ADM-031) leert Person, Profile, Kontakte, Uploads; `suppression` verhindert Wiederanlage;
  externe Löschung bei vivenu, HubSpot, Swapcard binnen 30 Tagen (QS-019, Runbook **offen**).
- **Widerruf:** Einwilligungen versioniert je Typ; `event_app`-Widerruf ⇒ Entfernen aus Swapcard beim nächsten Lauf; Newsletter ⇒ Sperrliste.

## 4 · Offene Punkte für die Datenschutzerklärung

1. Aufbewahrungsfristen je Verarbeitung festlegen (V2, V3, V4, V9, V12) — Vorschlag: Bewerbungen 12 Monate nach Edition, Tickets/Spesen 10 Jahre (HGB/AO), Mail-Protokoll 6 Monate.
2. Einwilligung `event_app` in Bewerbung, Ticketkauf-Redirect und Speaker-Onboarding aufnehmen (Text DE/EN, Version); Bestand ohne Einwilligung wird nicht übertragen.
3. Art.-9-Daten (Ernährung/Gesundheit in `hospitality_data`): ausdrückliche Einwilligung mit Zweck, Löschung nach der Edition.
4. Anthropic: Datenverarbeitungsvereinbarung und Aufbewahrung der Anfragen prüfen.
5. Vercel/Supabase-Logs: Speicherdauer und IP-Kürzung dokumentieren.
6. Informationspflichten gegenüber Dritten, die ein Speaker einträgt (Agentur/Office, 0127): Hinweis an die eingetragene Person klären.
