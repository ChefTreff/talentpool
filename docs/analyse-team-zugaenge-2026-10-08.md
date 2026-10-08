# Analyse: Team und Zugänge zusammenführen (ADM-094)

Stand 08.10.2026, Admin-Chat. Anlass: Konrad (08.10., Admin-Feedback Teil 1): „Team und Zugänge sind inhaltlich fast identisch, der Unterschied ist nicht erkennbar.“ Auftrag: alle Features erfassen, damit bei der Zusammenführung **nichts verloren geht**; Design prüft Struktur und Bedienung (ADM-090/ADM-089), Bau nach Konrads Go.

Diese Datei ändert nichts am Programm. Sie ist die Vorlage für den Design-Vorschlag und für den späteren Bau.

## 1 · Kurzbefund

- Es gibt **drei** Seiten für dasselbe Thema „wer darf was“: **Team** (`/admin/team`), **Zugänge** (`/admin/verwaltung/zugaenge`) und **Rollen** (`/admin/rollen`). Konrad nennt zwei; die dritte gehört dazu, weil Team und Rollen dieselben Funktionen (`assign_role`, `revoke_role`) aufrufen.
- Die Seiten zeigen **verschiedene Mengen** derselben Personen. Das ist der einzige echte Unterschied, und er steht nirgends auf der Seite:
  - **Team** = Personen mit einer aktiven **Team-Rolle** (14 Schlüssel in `team_role_keys()`, ohne Speaker, Partner, Volunteers, Kiosk).
  - **Zugänge** = Personen mit **Konto oder irgendeiner aktiven Rolle** (also auch Speaker, Partner-Kontakte, Kiosk-Geräte).
  - **Rollen** = eine einzelne Person, alle Rollen, jeder Scope.
- Drei Lücken, die die Zusammenführung gleich mitlöst:
  1. **Team zeigt gesperrte Personen wie aktive.** `team_members()` kennt `access_blocked_at` nicht; wer gesperrt ist, steht ohne Hinweis in der Liste (und hat trotzdem keinen Zugriff).
  2. **Zugänge zeigt Rollen als Systemschlüssel** (`talent_team, programme_team`), nicht als Anzeigenamen; Team nutzt die Namen aus dem Vokabular.
  3. **Zwei verschiedene Rechteprüfungen für dieselbe Seite:** `/admin/team` öffnet über den Abschnitt `team`, die Funktion prüft aber `has_role('admin')`. Wer den Abschnitt per Ausnahme (ADM-053) bekäme, sähe eine leere Liste. Zugänge prüft sauber über den Abschnitt `access`.

## 2 · Alle Funktionen, je Seite

| Funktion | Team | Zugänge | Rollen | Person (Detail) | Datenbank |
|---|---|---|---|---|---|
| Liste der Teammitglieder (Name, E-Mail, Rollen mit Scope, Konto ja/nein, seit wann) | ✔ | – | – | – | `team_members()` (nur `admin`) |
| Liste aller mit Konto oder Rolle (Name, E-Mail, Rollen, Login, gesperrt) | – | ✔ | – | – | `access_accounts(q, limit, offset)` (Abschnitt `access`) |
| Suche in der Liste | – (nur für „Person hinzufügen“) | ✔ (Name, E-Mail) | – | seit #392: `/admin/personen` | `access_accounts`, `search_people` |
| Seiten (50 je Seite) | – | ✔ | – | ✔ (#392) | `access_accounts` |
| Warnung „n ohne Konto“ | ✔ | (Badge je Zeile) | – | – | – |
| Rolle **vergeben**, global | ✔ (je Zeile und über Suche) | – | ✔ | – | `assign_role` |
| Rolle vergeben, **Edition** | ✔ (Suchkarte) | – | ✔ | – | `assign_role` |
| Rolle vergeben, **Portal, Org, Bühne, Bühnentag, Slot** | – | – | ✔ | – | `assign_role` |
| Rolle **entziehen** (mit Rückfrage, Hinweis „letzter Admin“) | ✔ (× am Badge) | – | ✔ | – | `revoke_role`; `last_admin` in der Datenbank |
| Rollen einer Person lesen (alle Scopes, auch abgelaufene) | – | – | ✔ | – | `roles_of_person` |
| **Teammitglied einladen** (Vorname, Nachname, E-Mail, Rollen, Edition; neu oder bestehend; Hinweismail bei bestehendem Konto, ADM-086) | – | ✔ | – | – | `create_team_member` + `inviteUserByEmail` |
| **Einladen / erneut einladen** (Anmelde-Mail an die hinterlegte Adresse) | – | ✔ (je Zeile) | – | – | `inviteUserByEmail`, `log_access_invite` |
| **Zugang sperren / öffnen** (mit Notiz; nicht sich selbst; Auth-Konto wird gebannt) | – | ✔ | – | – | `set_person_access` + `updateUserById(ban_duration)` |
| **Kiosk-Gerätekonto** anlegen (Bezeichnung, Team-Adresse, Edition) | – | ✔ | – | – | `create_kiosk_account` |
| **Abschnitte je Rolle/Person an- und ausschalten** (Ausnahmen zur Vorgabe, ADM-053) | – | – | ✔ | – | `set_admin_section_override`, `delete_admin_section_override`, `admin_section_overrides` |
| **Leistenvorschau** (was sieht diese Rolle im Menü?) | – | – | ✔ | – | `lib/admin-navigation.ts`, `lib/admin-sections.ts` |
| Link zur Person | ✔ | (Name ohne Link) | – | – | – |

Dazu aus dem Umfeld, das beim Zusammenführen **dabeibleibt** (nicht Teil der drei Seiten, aber im Menü „Verwaltung“): Dubletten, Löschanträge, Protokoll, Einwilligungen, Sperrliste, Personenliste (jetzt mit Konto-Filter, #392).

Protokoll heute (nichts davon darf wegfallen): `role.assign`, `role.revoke`, `access.invited`, `access.blocked`, `access.unblocked`, `access.team_member`, `access.kiosk_account`, dazu `admin_section.override` und `admin_section.override_removed` für die Ausnahmen (Anzeigenamen in `auditAction`).

## 3 · Gleich, ähnlich, verschieden

- **Gleich:** beide sind „Person + Rollen + Konto“ als Liste; beide vergeben/entziehen Rollen über dieselben Funktionen; beide verlinken (Team) oder sollten verlinken (Zugänge) auf die Person.
- **Nur Team:** die Warnung „ohne Konto“, die Rollenzeile je Person mit Scope-Name, das Hinzufügen einer Rolle in der Zeile.
- **Nur Zugänge:** Einladen, Sperren, Kiosk-Gerät, Suche und Seiten, die Menge „alle mit Zugang“ (auch Externe).
- **Verschieden gedacht:** Team beantwortet „wer gehört dazu“ (Mitarbeit), Zugänge „wer kommt rein“ (Anmeldung). Für Konrad ist das **eine** Frage: *Wer hat Zugang zu was — und wie ändere ich das?*

## 4 · Vorschlag für die Zusammenführung

**Eine Seite „Team & Zugänge“** (Arbeitstitel), bestehend aus

1. **Liste** (Grundlage `access_accounts`, erweitert): Person (Link) · E-Mail · **Rollen als Badges mit Scope, je Badge entziehbar** · Konto (mit Login / ohne Login) · **Zustand (aktiv / gesperrt)** · Aktionen (Rolle hinzufügen, Einladen, Sperren/Öffnen).
2. **Filter über der Liste** statt zwei Seiten: *Team* (nur Team-Rollen) · *Alle mit Zugang* · *Gesperrt* · *Ohne Login*; dazu Suche (Name, E-Mail) und Seiten. Das beantwortet die Frage „was ist der Unterschied“ **im Bedienelement**: es ist derselbe Bestand, anders gefiltert.
3. **Karte „Teammitglied einladen“** wie heute (`TeamEinladung`), oben, einklappbar.
4. **Karte „Rolle vergeben“** (Suche + Rolle + Scope Global/Edition) wie heute in Team, bleibt für den Fall „jemand, der noch keine Rolle hat“.
5. **Abschnitt „Geräte“** (Kiosk-Gerätekonto) eingeklappt.
6. **Rollen und Ausnahmen** (`/admin/rollen`: Scope Portal/Org/Bühne/Slot, Ausnahmen je Abschnitt, Leistenvorschau) bleiben eine **eigene Seite „Rechte“** — sie beantwortet „welche Rolle öffnet welchen Bereich“, nicht „wer“. Verlinkt aus der Zusammenführung („Rechte je Rolle ändern“). Design entscheidet, ob sie als zweiter Reiter derselben Seite erscheint.

**Wohin geht welche Funktion** (Gegenprobe gegen die Tabelle in 2): Teamliste → Filter *Team*; Warnung „ohne Konto“ → Filter *Ohne Login* mit Zählung; Rolle vergeben/entziehen → Badges und Karte 4; Teammitglied einladen → Karte 3; Einladen → Aktion je Zeile; Sperren/Öffnen → Aktion je Zeile; Kiosk → Abschnitt 5; Abschnitts-Ausnahmen und Leistenvorschau → „Rechte“ unverändert. **Nichts entfällt.**

## 5 · Was dafür gebaut werden muss

- **Eine neue Lesefunktion** `team_access_list(p_query, p_filter, p_limit, p_offset)` (Abschnitt `access`): wie `access_accounts`, dazu Rollen als `jsonb` mit Id, Scope-Name und Ablaufdatum (für das Entziehen am Badge), `since`, Admin-Zahl (für die Warnung „letzter Admin“) und `blocked_at`. Filter `team | alle | gesperrt | ohne_login` (unbekannt ⇒ 22023 `invalid_filter`). `team_members()` und `access_accounts()` bleiben bis zum Umzug bestehen.
- **Rechteprüfung vereinheitlichen:** ein Abschnitt (`access`) für die ganze Seite. Der Abschnitt `team` entfällt aus der Leiste und bekommt (falls Ausnahmen darauf liegen) dieselbe Wirkung wie `access`; Plan entscheidet, ob `team` bestehen bleibt, bis keine Ausnahme mehr darauf liegt.
- **Oberfläche:** eine Seite, die vorhandene Bausteine zusammensetzt (`TeamEinladung`, `Geraetekonto`, Rückfragen, Badges); Server Actions bleiben (`grantTeamRole`/`revokeTeamRole` aus Team, `setzeZugang`/`ladeEin`/`legeGeraetAn`/`ladeTeamEin` aus Zugänge).
- **Menü:** zwei Einträge („Team“, „Zugänge“) werden einer. **Das ist eine Navigationsänderung und wartet auf Konrads Go** (Auftrag 08.10.: keine Umstrukturierung der Navigation). Die alten Adressen leiten weiter; gemerkte Adressen brechen nicht.
- **Tests:** die Gegenprobe aus Abschnitt 2 als Test (jede Server Action existiert weiter; jede der neun Protokollaktionen wird weiter geschrieben); SQL-Test mit Filtern, Gesperrten in der Liste, Rechten.

## 6 · Offene Entscheidungen

1. **Eine Seite mit Filtern (Vorschlag) oder zwei Reiter** (Team / Alle mit Zugang)? Der Vorschlag nimmt Filter, weil Reiter denselben Bestand zerlegen würden.
2. **Bleibt „Rechte“ (`/admin/rollen`) eigenständig?** Vorschlag ja, im Menü neben Team & Zugänge.
3. **Gesperrte im Team sichtbar?** Vorschlag ja (Badge „gesperrt“, Filter *Gesperrt*) — heute unsichtbar, siehe Lücke 1.
4. **Abschnitt `team`:** entfällt zugunsten von `access`; Plan bestätigt, ob dazu eine Migration die Ausnahmen übernehmen soll.
5. **Reihenfolge:** Bau erst nach Konrads Go zum Design-Vorschlag (Struktur und Menü); die Lesefunktion und die Seite können vorher als Vorschlag-Migration bereitliegen.
