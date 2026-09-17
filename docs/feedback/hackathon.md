# Feedback-Backlog · Hackathon

Stand: 2026-09-17 · Pflege: die zuständige Build-Session; Konrad liest hier den Stand

| ID | Datum | Seite | Ist → Soll | Prio | Status | Quelle |
|---|---|---|---|---|---|---|
| HACK-001 | 14.09. | /hackathon | `HACKATHON_DISCORD_URL` fehlt, Discord wird erst in einigen Wochen aufgesetzt → Einladungslink setzen, damit die Seite ihn zeigen kann | P2 | erfasst (.env.local.example trägt nur den Platzhalter) | Welle-4-Bericht Frage 5 · Aufgabe Konrad |
| HACK-002 | 14.09. | /hackathon/teams | Teammitglieder als Feld `hack_team.members[]` → eigene Tabelle `hack_team_member`, weil eine Mitgliedschaft angelegt und verlassen wird und die Rechteprüfung sie einzeln lesen muss; „eine Person, ein Team je Edition“ wird damit ein Constraint statt einer Absprache | P3 | gebaut (0085; Entscheidungslog 14.09. akzeptiert) | Welle-4-Bericht Abw. 2 |
| HACK-003 | 14.09. | /hackathon/judging | Vier Judging-Kriterien als Wiederholgruppe → feste Formularfelder, weil die `deliverable`-Engine keine Wiederholgruppe kennt und eine Erweiterung der Engine mehr wäre als dieser Baustein | P3 | gebaut (0085; Entscheidungslog 14.09. akzeptiert) | Welle-4-Bericht Abw. 5 |
| HACK-004 | 14.09. | /hackathon/schedule | Eigenes Zeitplan-Modell für den Hackathon → Zeitplan aus `programme_public`; der Hackathon ist im Datenmodell ein Event der Edition mit Bühnen und Slots, eine zweite Tabelle hätte dieselben Felder noch einmal gehabt | P3 | abgenommen (Konrads Antwort 14.09., Entscheidungslog) | Welle-4-Bericht Abw. 6 |
| HACK-005 | 17.09. | /hackathon | Partner- und Teilnehmer-Sicht sind vermischt → `/hackathon` bleibt die Teilnehmer-App (Teams, Challenges, Zeitplan, Judging); die Partner-Verwaltung (Challenge, Preise, Backdrop, Fristen) wandert ins Partner-Portal (PART-033); Partner wechseln über den Umschalter | P2 | erfasst | Walkthrough 17.09., Antwort 1 |
