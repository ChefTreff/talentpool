/**
 * Titel und Beschreibungen des Summit 26 als Vorbilder für den Assistenten
 * (SPK-012).
 *
 * **Erzeugt**, nicht von Hand geschrieben: aus `docs/referenz/talk-titel-2026.csv`
 * (170 Sessions, von Konrad geliefert). Je Format die drei Beschreibungen, die
 * der Ziellänge von etwa 550 Zeichen am nächsten kommen — das ist der
 * Median des Bestands und damit der Ton des Hauses. Sehr kurze und sehr lange
 * Texte sind schlechte Vorbilder.
 *
 * Sie stehen als Datei und nicht als Datenbankabfrage da: der Systemtext muss
 * bei jedem Aufruf gleich sein, sonst schlägt der Assistent heute einen anderen
 * Ton an als gestern.
 *
 * Neu erzeugen, wenn die CSV sich ändert; die Herkunft steht in
 * `docs/referenz/talk-titel-2026.md`.
 */
export type Beispiel = { titel: string; beschreibung: string };

/** Die Länge, auf die eine Beschreibung zielen soll — Median des Bestands 2026. */
export const ZIEL_ZEICHEN = 550;

export const TITEL_BEISPIELE: Record<string, Beispiel[]> = {
  "interview": [
    {
      "titel": "Breaking Into Journalism: Is It Still Worth It?",
      "beschreibung": "Mit 14 Jahren entschied sich Amelie Marie Weber für eine Laufbahn als Journalistin. Dieser Idee blieb sie die letzten 17 Jahre treu und ist heute erfolgreiche ARD-Moderatorin und Journalistin. Für die Tagesschau informiert sie in Onlineformaten Millionen von Zuschauern, sitzt in Talk Shows und moderierte die diesjährigen Olympischen Winterspiele. Warum sie der Beruf der Journalistin im Kindesalter so begeistert hat und sie noch heute für eine Laufbahn im Journalismus wirbt, erzählt sie uns in einem ausführlichen Interview."
    },
    {
      "titel": "Live-Podcast mit Lena Cassel: Mut, Mindset & Männerwelt - Lenas Weg im Sportjournalismus",
      "beschreibung": "Lena Cassel ist eine leidenschaftliche Sportjournalistin & Podcasterin, die mit viel Mut und einem starken Mindset ihren Platz in der Männerwelt des Sports gefunden hat. Neben ihrer Arbeit vor und hinter den Kulissen teilt sie in diesem Live-Podcast ehrliche Einblicke aus ihrem Weg, ihre Erfahrungen und die Herausforderungen, die sie als Frau in einer männerdominierten Branche meistert. Lena inspiriert mit ihrer authentischen Art und zeigt, wie man mit Selbstvertrauen und Durchhaltevermögen seine Träume verwirklichen kann."
    },
    {
      "titel": "Interview: Transformation, Kultur und Hybrides Führen - Tobias Key-Learnings aus 20 Jahren Führungserfahrung",
      "beschreibung": "Tobias Krüger hat schon viel Veränderung gesehen - und hat diese oftmals aktiv selbst gestaltet und geführt. In diesem Interview gibt Tobias wertvolle Tipps zu Hybrider Führung und erklärt, welche Rolle der gesellschaftliche Wandel samt seiner Normen dabei spielt. Durch seine jahrelange Erfahrung als Führungskraft, Kulturmanager & Gründer weiß Tobias ob der Bedeutung des Menschen - im Konzern und im Start-Up. Bei aller technologischer Herausforderung.\nWarum Tobias glaubt, dass man für C-Level zwingend Transformationserfahrungen haben muss, das erfahrt ihr in diesem Interview."
    }
  ],
  "keynote": [
    {
      "titel": "AI Ready - KI muss der Golden Retriever in Deinem Arbeitsalltag sein",
      "beschreibung": "Treu, zuverlässig und immer an deiner Seite - genau so sollte KI in deinem Arbeitsalltag funktionieren. Doch zwischen Hype und Realität klafft oft eine große Lücke. Bernd Peper, Partner bei Sopra Steria, und Consultant Sahra Klünder bringen mit, was viele KI-Talks vermissen lassen: echte Praxiserfahrung aus der Beratung. Sie zeigen, wie Unternehmen KI heute wirklich sinnvoll einsetzen, wo der größte Hebel liegt und wie ihr euch jetzt AI Ready macht - damit KI nicht der überforderte Welpe bleibt, sondern euer treuester Begleiter im Job wird."
    },
    {
      "titel": "Ein Leben nach Olympia: Ambitionen haben, ohne sich dabei zu verlieren",
      "beschreibung": "Rio 2016: Das vermutlich größte Sportereignis der Welt. Und sie holt mit Deutschland eine Bronzemedaille. In dieser bewegenden Keynote spricht Nike Lorenz über die Parallelen zwischen Leistungssport und der Arbeitswelt. Über das, was sie aus ihrer Zeit im Profisport gelernt hat. Und über die Herausforderungen dabei, in ihrer zweiten Karriere anzukommen.\nWas Nike in beiden Welten vereint, ist ihr unbändiger Wille zu lernen und der Glaube daran, dass man nur wirklich gut in etwas werden kann, wenn man eine Leidenschaft dafür entwickelt."
    },
    {
      "titel": "KI vs. Mensch: Welche Intelligenz bestimmt die Zukunft?",
      "beschreibung": "Wie verändert KI unsere Arbeitswelt, unser Verständnis von Sinn und Verantwortung? Richard David Precht analysiert die gesellschaftsphilosophischen Folgen der Digitalisierung: Welche Chancen eröffnet KI für Innovation und Fortschritt? Wo liegen die Grenzen maschineller Intelligenz? Was macht den Menschen unersetzbar? Precht zeigt, dass KI kein Schicksal ist, sondern ein gestaltbarer Prozess. Ein inspirierender Ausblick für Talente, die die Zukunft aktiv mitgestalten wollen - technologisch versiert, ethisch reflektiert, zukunftsfähig."
    }
  ],
  "masterclass": [
    {
      "titel": "Empathie schlägt Algorithmus: Warum der Makler der Zukunft durch KI menschlicher wird.",
      "beschreibung": "Bitte hier bewerben: https://tinyurl.com/53f8nx2h\n\nGewerbeimmobilien sind kein Bauchgefühl-Geschäft - es geht um strategische Investments, komplexe Deals und Entscheidungen mit enormer Tragweite. Doch am Ende entscheidet nicht der beste Algorithmus, sondern das beste Gespräch. Engel & Völkers Commercial zeigt, warum gerade in einer Welt voller KI und Daten das Menschliche zum entscheidenden Wettbewerbsvorteil wird - und warum Empathie, Vertrauen und Verhandlungsgeschick jede Technologie schlagen. Ein Talk, der das klassische Makler-Image hinter sich lässt und zeigt, was diesen Beruf wirklich ausmacht."
    },
    {
      "titel": "Venture Client Masterclass: Gaining a Competitive Edge with Startup Technologies",
      "beschreibung": "Venture Clienting is one of the fastest ways for startups to land enterprise customers - and for corporates to access cutting-edge innovation. In this masterclass, you'll learn how to strategically leverage venture clienting to build meaningful business relationships, accelerate your go-to-market and gain a real competitive edge. Whether you're on the startup or corporate side - this is the playbook for turning first contact into long-term success."
    },
    {
      "titel": "Emotions in Business: The Missing Chapter in your Management Degree",
      "beschreibung": "Bitte hier bewerben: https://tinyurl.com/53f8nx2h\n\nMost management degrees teach you strategy, finance, and operations. Almost none teach you how emotions actually drive power, influence, and performance inside organizations. In this Masterclass, Prof. Dr. Prisca Brosi reveals what truly shapes leadership impact, hiring decisions, and career acceleration behind the scenes. Based on research published in top international journals, you’ll discover how emotional signals influence who gets trusted, promoted, or overlooked. And how to use this knowledge to your advantage. If you want a competitive edge beyond the textbook, this is where it starts."
    }
  ],
  "panel": [
    {
      "titel": "Deep Tech Made in Hamburg - From Lab to Global Market",
      "beschreibung": "Hamburg is emerging as a leading Deep Tech hub. Prof. Dr. Wim Leemans (DESY), renowned plasma accelerator pioneer, and Prof. Dr. Blanche Schwappach-Pignataro (UKE), Dean and molecular biologist, discuss how to translate breakthrough research into global impact. Learn about Hamburg's Deep Tech ecosystem, scaling research into commercial ventures, and career paths for sciencepreneurs moving from academia to industry. Discover how fundamental science becomes breakthrough business—and why Hamburg is building the future, one lab at a time."
    },
    {
      "titel": "Olympische und Paralympische Spiele in Hamburg. Eine Chance für alle.",
      "beschreibung": "Im Fokus steht die Frage, welche Chancen Olympische und Paralympische Spiele für Hamburg bieten können: sportlich, gesellschaftlich und wirtschaftlich. Ehemalige Olympioniken aus Schwimmen und Hockey bringen ihre persönlichen Erfahrungen ein und diskutieren gemeinsam mit der Projektperspektive, wie ein solches Sportereignis als inklusiver Impulsgeber für die Stadt wirken kann. Das Panel beleuchtet, wie die Spiele Hamburger inspirieren, Teilhabe stärken und nachhaltige Entwicklungen in der Hansestadt anstoßen können."
    },
    {
      "titel": "Hamburg als internationaler Karrierestandort in der Luftfahrt",
      "beschreibung": "Hamburg ist nach Toulouse der zweitgrößte Standort der zivilen Luftfahrt weltweit - doch was bedeutet das konkret für junge Talente? In diesem Panel beleuchten Airbus, das Aviation-Startup Kratena und das Netzwerk Hamburg Aviation gemeinsam, welche Karrieremöglichkeiten die Luftfahrtbranche in Hamburg bietet - vom globalen Konzern über innovative Startups bis hin zum starken Branchennetzwerk. Moderiert durch Hamburg Invest erfahrt ihr, warum Hamburg der Ort ist, an dem Karrieren in der Luftfahrt abheben."
    }
  ],
  "pitch_battle": [
    {
      "titel": "How Germany Is Driving the New Space Ecosystem to the Next Level",
      "beschreibung": "Space is no longer sci-fi - it's business. Germany's New Space ecosystem is booming with startups building satellites, launch systems, and space infrastructure. Watch the next generation of space founders pitch live on stage. From orbital logistics to Earth observation, from propulsion tech to space sustainability - these startups are literally reaching for the stars. Who will win? You decide. The future of space is being built in Germany - right now."
    }
  ],
  "podcast": [
    {
      "titel": "Aufstieg durch Leistung? Drei Karrierewege zwischen Fleiß, Talent und Timing",
      "beschreibung": "Leistung lohnt sich - oder? Drei Menschen, drei Karrieren, drei Wahrheiten. Im Live-Podcast diskutieren David Döbele, Andreas Klassen und Cihan Sügür offen: Wie viel zählt wirklich Fleiß? Wann ist Talent entscheidend? Und welche Rolle spielt Glück, Timing oder das richtige Netzwerk? Zwischen Meritokratie-Mythos und harter Realität - ein ehrliches Gespräch über Aufstieg, Chancen und die Frage: Ist Erfolg verdient oder Zufall? Ungefiltert, persönlich und garantiert kontrovers."
    },
    {
      "titel": "Career Path navigation - how to set yourself up for a fulfilling career",
      "beschreibung": "Wie baut man eine Karriere auf, die wirklich erfüllt - nicht nur auf dem Papier, sondern im echten Leben? In diesem Panel teilen zwei Frauen mit außergewöhnlichen Karrierewegen ihre Erfahrungen. Nina von Google, Host des Tech & Leadership Podcast AccessAllAreas, gibt Einblicke in bewusste Karrieregestaltung im Live-Podcast mit Christine Prauschke, C-Level in unterschiedlichen Branchen und von Startup bis Konzern, teilt ihre Learnings aus einem Karriereweg mit überraschenden Moves trotz rotem Faden. Gemeinsam zeigen sie, wie man kluge Karriereentscheidungen trifft, wann der richtige Moment für Veränderung ist und was es braucht, um einen Weg zu gehen, der zu einem passt."
    },
    {
      "titel": "Führen mit Verantwortung: Perspektiven auf Macht, Geld und Gesellschaft. Ein ZEIT-Live-Podcast.",
      "beschreibung": "Mit Antje von Dewitz und Sebastian Klein beleuchten wir, wie sich Unternehmertum über verschiedene Generationen hinweg verändert. Wir sprechen über die Herausforderungen und Chancen beim Gründen und Führen von Unternehmen, über Arbeitsbelastung, Verantwortung und persönliche Grenzerfahrungen."
    }
  ],
  "side_event": [
    {
      "titel": "Croissants & Change: Dein Frühstück für Impact-Gründung U30",
      "beschreibung": "Moin Cornelius,\n\nklar - wir hinterlegen den Anmeldelink gern:\n\nhttps://koerber-starthub.de/veranstaltungen/croissants-change-fruehstueck-fuer-impact-gruendungsinteressierte-u30/\n\nGuter Punkt mit der Warteliste: So bleibt ihr flexibel in der Anmeldung und könnt die Kapazität bei Bedarf unkompliziert anpassen. Wenn du magst, sag kurz Bescheid, wie der Link genannt werden soll (z. B. „Anmeldung“, „Jetzt Platz sichern“) und ob wir zusätzlich einen Hinweis wie „begrenzte Plätze / Warteliste möglich“ setzen sollen."
    },
    {
      "titel": "Future Leaders Award Verleihung",
      "beschreibung": "Die mutigsten Talente, innovativsten Projekte, stärksten Initiativen - heute werden sie ausgezeichnet! Der Future Leaders Award 2026 ehrt die Next Generation aus Wirtschaft, Wissenschaft, Tech und Social Impact. Nach hunderten Bewerbungen, tausenden Votes und packenden Finalistinnen-Pitches kürt unsere Jury jetzt die Gewinnerinnen. Wer gestaltet die Zukunft? Wer übernimmt Verantwortung? Wer inspiriert eine ganze Generation? Jetzt wird es offiziell. Let's celebrate leadership!"
    },
    {
      "titel": "Exklusives Netzwerkpartner Pre-Event - ChefTreff x KLU",
      "beschreibung": "Hinweis: Das Event ist exklusiv für unsere Netzwerkpartner und nicht öffentlich zugänglich.\n\nAm Vorabend des FUTURE LEADERS SUMMIT 2026 feiern wir gemeinsam mit unseren Netzwerkpartnern den Auftakt in ein inspirierendes Wochenende voller Begegnungen und neuer Perspektiven. Die Kühne Logistics University Hamburg öffnet exklusiv für unsere Partner ihre Türen und bietet einen Abend mit spannenden Keynotes, neuen Impulsen und offenen Gesprächen bei Food & Drinks."
    }
  ]
};

/** Die Beispiele für ein Format; fällt auf Keynote zurück, das ist die Mehrheit. */
export function beispieleFuer(format: string | null | undefined): Beispiel[] {
  return TITEL_BEISPIELE[format ?? ""] ?? TITEL_BEISPIELE.keynote ?? [];
}
