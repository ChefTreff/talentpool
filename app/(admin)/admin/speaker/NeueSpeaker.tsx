"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { handoverSpeaker, setContacts, setPipeline, type AdminResult } from "./actions";
import type { PartnerSpeakerRow, SpeakerManager } from "./types";

type Strings = Record<string, string>;

/** Ein Buddy zur Auswahl: ein Ansprechpartner der Edition vom Typ `speaker_buddy`. */
export type BuddyOption = { id: string; name: string };

type Feld = "stand" | "owner" | "buddy";

/**
 * Die Liste „Neue Speaker“ (ADM-084, Konrad & Leopold 05.10.2026): Speaker, die ein Partner für seinen Talk oder seine
 * gebrandete Bühne angelegt hat und bei denen die Betreuung fehlt oder der Stand noch „Lead“ ist. Das Team teilt hier
 * **Stand, Betreuung und Buddy** zu — in der Zeile, ohne das Detail zu öffnen. Die Auswahlfelder rufen die Aktionen, die es
 * schon gibt (`setPipeline`, `handoverSpeaker`, `setContacts`): dieselben Funktionen, dieselben Rechte, derselbe Eintrag im
 * Audit wie im Detail — ein zweiter Schreibweg entsteht nicht. Sobald Betreuung **und** Stand gesetzt sind, ist der Speaker
 * nicht mehr neu und fällt beim Neuladen aus der Liste (und aus der Zahl im Menü); in der Speaker-Liste behält er die Marke
 * „von <Partner>“.
 *
 * Zwei Einschränkungen, ehrlich benannt:
 * - Die Absage geht hier nicht (sie braucht einen Grund) — dafür führt der Name ins Detail.
 * - Den **Buddy** darf nur setzen, wer die Ansprechpartner der Edition pflegt (`set_speaker_contacts`: Admin und Leitung
 *   Speaker, nicht das Programm-Team). Wer es nicht darf, sieht den Buddy als Text statt als Auswahl; die Datenbank verweigert
 *   es ohnehin.
 */
export function NeueSpeaker({
  rows,
  managers,
  buddies,
  buddiesEditierbar,
  stand,
  dateLocale,
  t,
  rpcMessages,
}: {
  /** Nur die neuen — die Seite filtert `is_new`. */
  rows: PartnerSpeakerRow[];
  managers: SpeakerManager[];
  buddies: BuddyOption[];
  /** Darf die Person den Buddy setzen? (Ansprechpartner der Edition lesbar = ja.) */
  buddiesEditierbar: boolean;
  /** Bezeichnungen des Pipeline-Stands, nach Schlüssel. */
  stand: Record<string, string>;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Was gerade gespeichert wurde, bis die Seite den neuen Stand liefert: je Profil und Feld der Wert **von** dem aus
  // gewählt wurde und der gewählte. Gilt nur, solange der Server noch den alten Wert nennt — danach zählt der Server.
  const [lokal, setLokal] = useState<Record<string, Partial<Record<Feld, { von: string; zu: string }>>>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  const name = (r: PartnerSpeakerRow) => [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";

  /** Der angezeigte Wert: der eben gespeicherte, solange der Server noch den alten nennt. */
  function wert(r: PartnerSpeakerRow, feld: Feld): string {
    const server = feld === "stand" ? r.pipeline_status : feld === "owner" ? (r.owner_person_id ?? "") : (r.buddy_contact_id ?? "");
    const merk = lokal[r.profile_id]?.[feld];
    return merk && merk.von === server ? merk.zu : server;
  }

  function aendere(r: PartnerSpeakerRow, feld: Feld, neu: string) {
    const von = feld === "stand" ? r.pipeline_status : feld === "owner" ? (r.owner_person_id ?? "") : (r.buddy_contact_id ?? "");
    if (neu === wert(r, feld)) return;
    startTransition(async () => {
      let res: AdminResult;
      if (feld === "stand") res = await setPipeline(r.profile_id, neu, null);
      else if (feld === "owner") res = await handoverSpeaker(r.profile_id, neu || null);
      // `setContacts` setzt beide Ansprechpartner; der Lead bleibt, wie er ist.
      else res = await setContacts(r.profile_id, r.lead_contact_id, neu || null);
      if (res.ok) {
        setLokal((alt) => ({ ...alt, [r.profile_id]: { ...alt[r.profile_id], [feld]: { von, zu: neu } } }));
        toast("success", feld === "stand" ? t.newSavedStand : feld === "owner" ? t.newSavedOwner : t.newSavedBuddy);
        router.refresh();
      } else {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
      }
    });
  }

  if (rows.length === 0) {
    return <EmptyState title={t.newEmptyTitle} description={t.newEmptyBody} />;
  }

  /** Der Stand „abgesagt“ gehört nicht in die Zeile: er braucht einen Grund und steht im Detail. */
  const standOptionen: SelectOption[] = Object.entries(stand)
    .filter(([schluessel]) => schluessel !== "declined")
    .map(([value, label]) => ({ value, label }));

  /** Eine Auswahl mit allen Optionen **und**, falls der aktuelle Wert nicht dabei ist, mit ihm (sonst zeigt sie fälschlich den ersten Eintrag). */
  function mitAktuellem(optionen: SelectOption[], aktuell: string, beschriftung: string | null): SelectOption[] {
    if (aktuell === "" || optionen.some((o) => o.value === aktuell)) return optionen;
    return [...optionen, { value: aktuell, label: beschriftung ?? "—" }];
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="ct-help text-muted">{t.newLead}</p>
      <Table stapeln>
        <Thead>
          <Th>{t.colName}</Th>
          <Th>{t.newColPartner}</Th>
          <Th>{t.newColSession}</Th>
          <Th>{t.newColStand}</Th>
          <Th>{t.colOwner}</Th>
          <Th>{t.newColBuddy}</Th>
        </Thead>
        <Tbody>
          {rows.map((r) => {
            const erste = r.sessions[0];
            const weitere = r.sessions.length - 1;
            return (
              <Tr key={r.profile_id}>
                <Td>
                  <Link href={`/admin/speaker/${r.profile_id}`} className="ct-link font-medium">
                    {name(r)}
                  </Link>
                  {r.job_title && <span className="ct-help block text-muted">{r.job_title}</span>}
                  {r.organization_name && <span className="ct-help block text-muted">{r.organization_name}</span>}
                </Td>
                <Td label={t.newColPartner}>
                  <Badge>{r.partner_name ?? "—"}</Badge>
                </Td>
                <Td label={t.newColSession}>
                  {erste ? (
                    <>
                      <span className="block">{erste.title_de ?? erste.title_en ?? "—"}</span>
                      <span className="ct-help block text-muted">
                        {[erste.stage_name, erste.start_at ? zeit.format(new Date(erste.start_at)) : null].filter(Boolean).join(" · ")}
                        {weitere > 0 && ` · ${t.newMore.replace("{n}", String(weitere))}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">{t.noSessions}</span>
                  )}
                </Td>
                <Td label={t.newColStand}>
                  <Select
                    aria-label={`${t.newColStand}: ${name(r)}`}
                    value={wert(r, "stand")}
                    disabled={pending}
                    onChange={(e) => aendere(r, "stand", e.target.value)}
                    options={mitAktuellem(standOptionen, wert(r, "stand"), stand[wert(r, "stand")] ?? null)}
                  />
                </Td>
                <Td label={t.colOwner}>
                  <Select
                    aria-label={`${t.colOwner}: ${name(r)}`}
                    value={wert(r, "owner")}
                    placeholder={t.withoutOwner}
                    disabled={pending}
                    onChange={(e) => aendere(r, "owner", e.target.value)}
                    options={mitAktuellem(
                      managers.map((m) => ({ value: m.person_id, label: m.display_name ?? m.email ?? m.person_id })),
                      wert(r, "owner"),
                      r.owner_name,
                    )}
                  />
                </Td>
                <Td label={t.newColBuddy}>
                  {buddiesEditierbar ? (
                    <Select
                      aria-label={`${t.newColBuddy}: ${name(r)}`}
                      value={wert(r, "buddy")}
                      placeholder={t.contactDefault}
                      disabled={pending}
                      onChange={(e) => aendere(r, "buddy", e.target.value)}
                      options={mitAktuellem(
                        buddies.map((b) => ({ value: b.id, label: b.name })),
                        wert(r, "buddy"),
                        r.buddy_name,
                      )}
                    />
                  ) : (
                    <span className={r.buddy_name ? undefined : "text-muted"}>{r.buddy_name ?? t.contactDefault}</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </div>
  );
}
