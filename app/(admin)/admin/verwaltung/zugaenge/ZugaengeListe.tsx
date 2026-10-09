"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { ConfirmDialog, Modal, ModalFuss } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { grantTeamRole, ladeEin, revokeTeamRole, setzeZugang, type Ergebnis } from "./actions";

export type KontoRolle = {
  id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  edition_id: string | null;
  portal: string | null;
  valid_to: string | null;
  /** Der Geltungsbereich als Name — `null` bedeutet global. */
  scope_label: string | null;
};

/** Eine Zeile von `team_access_list` (ADM-094). */
export type Konto = {
  person_id: string;
  name: string | null;
  email: string | null;
  has_login: boolean;
  blocked_at: string | null;
  is_team: boolean;
  is_admin: boolean;
  roles: KontoRolle[];
  since: string | null;
  admins: number;
  total: number;
};

type Frage =
  | { art: "sperren" | "oeffnen" | "einladen"; konto: Konto }
  | { art: "entziehen"; konto: Konto; rolle: KontoRolle };

/**
 * Team und Zugänge in einer Liste (ADM-094): **eine Zeile je Person, eine Aktion je Zustand.**
 *
 * - Rollen sind Marken mit × (entziehen, Rückfrage; die Historie bleibt) und „+ Rolle“.
 * - Der Zugang ist eine Marke mit Wort **und** Farbe: Aktiv · Gesperrt · Ohne Login. Gesperrte stehen
 *   sichtbar in der Liste — bis ADM-094 verschwanden sie aus dem Team, ohne dass es jemand sah.
 * - Je Zustand ein Handgriff: bei Aktiv das Menü „Aktionen“, bei Gesperrt „Zugang öffnen“, bei Ohne Login
 *   „Einladen“.
 *
 * Jeder Handgriff fragt nach und sagt, was danach gilt. Die Rechte prüfen die Datenbankfunktionen
 * (`assign_role`, `revoke_role`, `set_person_access`); die Oberfläche bietet nur an, was gelingen kann:
 * den eigenen Zugang sperrt niemand, den letzten Admin entzieht niemand ohne Warnung.
 */
export function ZugaengeListe({
  konten,
  basisAdresse,
  seite,
  proSeite,
  selbst,
  rollen,
  rollenLabel,
  editionId,
  editionName,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  konten: Konto[];
  /** Adresse der Seite mit Suche und Filter, ohne `seite` — die Blätterlinks hängen sie an. */
  basisAdresse: string;
  seite: number;
  proSeite: number;
  selbst: string | null;
  /** Alle Teamrollen (auch `admin`: die Rolle vergibt man nur hier). */
  rollen: { value: string; label: string }[];
  rollenLabel: Record<string, string>;
  editionId: string | null;
  editionName: string | null;
  dateLocale: string;
  t: Record<string, string>;
  common: { cancel: string; save: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [frage, setFrage] = useState<Frage | null>(null);
  const [notiz, setNotiz] = useState("");
  const [rolleFuer, setRolleFuer] = useState<Konto | null>(null);
  const [neueRolle, setNeueRolle] = useState("");
  const [geltung, setGeltung] = useState("global");
  const [pending, start] = useTransition();

  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const nachricht = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");

  const gesamt = konten[0]?.total ?? 0;
  const seiten = Math.max(1, Math.ceil(gesamt / proSeite));
  const mitSeite = (n: number) => `${basisAdresse}${n > 1 ? `${basisAdresse.includes("?") ? "&" : "?"}seite=${n}` : ""}`;

  function melden(res: Ergebnis, okText: string | null) {
    if (res.ok) {
      if (okText) toast("success", okText);
      router.refresh();
      return;
    }
    toast("error", nachricht(res.key, res.detail));
  }

  function ausfuehren() {
    if (!frage) return;
    const aktuell = frage;
    start(async () => {
      let res: Ergebnis;
      let ok: string | null = null;
      if (aktuell.art === "einladen") {
        res = await ladeEin(aktuell.konto.person_id);
        ok = t.invited;
      } else if (aktuell.art === "entziehen") {
        res = await revokeTeamRole(aktuell.rolle.id);
        ok = t.revoked;
      } else {
        res = await setzeZugang(aktuell.konto.person_id, aktuell.art === "sperren", notiz);
      }
      setFrage(null);
      setNotiz("");
      melden(res, ok);
    });
  }

  function rolleVergeben() {
    if (!rolleFuer || !neueRolle) return;
    const ziel = rolleFuer;
    start(async () => {
      const res = await grantTeamRole(ziel.person_id, neueRolle, geltung === "edition" ? editionId : null);
      setRolleFuer(null);
      melden(res, t.granted);
    });
  }

  function rolleOeffnen(k: Konto) {
    setNeueRolle("");
    setGeltung("global");
    setRolleFuer(k);
  }

  const fragen = (art: "sperren" | "oeffnen" | "einladen", konto: Konto) => setFrage({ art, konto });

  if (konten.length === 0) return <EmptyState title={t.empty} description={t.emptyBody} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="ct-label text-ink">{t.count.replace("{n}", String(gesamt))}</p>
      <Table stapeln>
        <Thead>
          <Th>{t.colPerson}</Th>
          <Th>{t.colRoles}</Th>
          <Th>{t.colAccess}</Th>
          <Th>{t.colSince}</Th>
          <Th aria-label={t.colAction} />
        </Thead>
        <Tbody>
          {konten.map((k) => {
            const rolleNamen = (r: KontoRolle) => `${rollenLabel[r.role] ?? r.role}${r.scope_label ? ` · ${r.scope_label}` : ""}`;
            const eigen = k.person_id === selbst;
            return (
              <Tr key={k.person_id}>
                <Td>
                  <Link href={`/admin/personen/${k.person_id}`} className="ct-link font-medium">
                    {k.name ?? common.none}
                  </Link>
                  {k.email && <span className="ct-help block text-muted">{k.email}</span>}
                </Td>
                <Td label={t.colRoles}>
                  <div className="flex flex-wrap items-center gap-1">
                    {k.roles.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        title={t.revoke}
                        aria-label={`${t.revoke}: ${rolleNamen(r)}`}
                        disabled={pending}
                        onClick={() => setFrage({ art: "entziehen", konto: k, rolle: r })}
                        className="rounded-ct-sm focus-visible:outline-2 pointer-coarse:min-h-11"
                      >
                        <Badge tone={r.role === "admin" ? "accent" : "neutral"}>
                          {rolleNamen(r)}
                          <span aria-hidden>×</span>
                        </Badge>
                      </button>
                    ))}
                    {k.roles.length === 0 && <span className="ct-help text-muted">{t.noRoles}</span>}
                    {!k.blocked_at && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => rolleOeffnen(k)}>
                        {t.addRole}
                      </Button>
                    )}
                  </div>
                </Td>
                <Td label={t.colAccess}>
                  {k.blocked_at ? (
                    <Badge tone="error">{t.blocked}</Badge>
                  ) : k.has_login ? (
                    <Badge tone="success">{t.active}</Badge>
                  ) : (
                    <Badge tone="warning">{t.noLogin}</Badge>
                  )}
                </Td>
                <Td label={t.colSince}>{k.since ? datum.format(new Date(k.since)) : "—"}</Td>
                <Td>
                  {k.blocked_at ? (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => fragen("oeffnen", k)}>
                      {t.unblock}
                    </Button>
                  ) : !k.has_login ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {k.email ? (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => fragen("einladen", k)}>
                          {t.inviteNow}
                        </Button>
                      ) : (
                        <span className="ct-help text-muted">{t.noEmail}</span>
                      )}
                      {/* Auch wer noch nie eingeloggt war, lässt sich sperren (alle Rollen weg, Anmeldung zu) —
                          das konnte die alte Liste, und „nichts entfällt“ (ADM-094). Eine sichtbare Aktion je
                          Zeile, der Rest im Menü (Design 09.10.). */}
                      {!eigen && (
                        <Menu label={`${t.actions}: ${k.name ?? ""}`} trigger={t.actions} ton="hell" align="end" width="w-64">
                          <MenuItem onSelect={() => fragen("sperren", k)}>{t.block}</MenuItem>
                        </Menu>
                      )}
                    </div>
                  ) : (
                    <Menu label={`${t.actions}: ${k.name ?? ""}`} trigger={t.actions} ton="hell" align="end" width="w-64">
                      <MenuItem onSelect={() => rolleOeffnen(k)}>{t.addRoleTitle}</MenuItem>
                      {k.email && <MenuItem onSelect={() => fragen("einladen", k)}>{t.reinvite}</MenuItem>}
                      {/* Den eigenen Zugang gar nicht erst anbieten: die Datenbank weist es ab, aber ein Eintrag,
                          der immer scheitert, ist eine Falle. */}
                      {!eigen && <MenuItem onSelect={() => fragen("sperren", k)}>{t.block}</MenuItem>}
                    </Menu>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      <div className="flex flex-wrap items-center gap-3">
        <span className="ct-help">{t.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}</span>
        {seite > 1 && <Link className="ct-link ct-small" href={mitSeite(seite - 1)}>{t.prev}</Link>}
        {seite < seiten && <Link className="ct-link ct-small" href={mitSeite(seite + 1)}>{t.next}</Link>}
      </div>

      {frage && (
        <ConfirmDialog
          title={
            frage.art === "entziehen" ? `${t.revokeTitle}: ${rollenLabel[frage.rolle.role] ?? frage.rolle.role}`
            : frage.art === "einladen" ? t.inviteTitle
            : frage.art === "sperren" ? t.blockTitle
            : t.unblockTitle
          }
          body={
            frage.art === "einladen" ? t.inviteBody
            : frage.art === "sperren" ? t.blockBody
            : frage.art === "oeffnen" ? t.unblockBody
            : t.revokeBody
          }
          detail={
            <span className="flex flex-col gap-3">
              <span className="ct-label text-ink">{frage.konto.name ?? frage.konto.email ?? frage.konto.person_id}</span>
              {/* Den letzten Admin lässt die Datenbank nicht entziehen. Das vorher zu sagen ist freundlicher, als
                  jemanden in den Fehler laufen zu lassen; verhindert wird es trotzdem dort. */}
              {frage.art === "entziehen" && frage.rolle.role === "admin" && frage.konto.admins <= 1 && (
                <span className="ct-small text-error-ink">{t.lastAdmin}</span>
              )}
              {/* Die Notiz steht im Audit-Log. „Warum“ ist die Frage, die man in einem halben Jahr stellt. */}
              {(frage.art === "sperren" || frage.art === "oeffnen") && (
                <Field label={t.noteLabel} htmlFor="zg-note">
                  <Input id="zg-note" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
                </Field>
              )}
            </span>
          }
          confirmLabel={
            frage.art === "einladen" ? t.inviteNow
            : frage.art === "sperren" ? t.block
            : frage.art === "oeffnen" ? t.unblock
            : t.revoke
          }
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => { setFrage(null); setNotiz(""); }}
          onConfirm={ausfuehren}
        />
      )}

      {rolleFuer && (
        <Modal label={t.addRoleTitle} onCancel={() => setRolleFuer(null)}>
          <h2 className="ct-h3">{t.addRoleTitle}</h2>
          <p className="ct-help mt-2">{rolleFuer.name ?? rolleFuer.email ?? common.none}</p>
          <div className="mt-4 flex flex-col gap-4">
            <Field label={t.role} htmlFor="zg-rolle">
              <Select
                id="zg-rolle"
                value={neueRolle}
                placeholder={t.choose}
                onChange={(e) => setNeueRolle(e.target.value)}
                options={rollen.filter(
                  (o) => !rolleFuer.roles.some((r) => r.role === o.value && r.scope_type === "global"),
                )}
              />
            </Field>
            {/* Der Admin ist bewusst nie auf eine Edition begrenzt: ein Admin, der nur für FLS27 gilt, wäre im
                Jahr darauf lautlos keiner mehr. */}
            <Field label={t.scope} htmlFor="zg-scope">
              <Select
                id="zg-scope"
                value={neueRolle === "admin" ? "global" : geltung}
                disabled={neueRolle === "admin" || !editionId}
                onChange={(e) => setGeltung(e.target.value)}
                options={[
                  { value: "global", label: t.scopeGlobal },
                  ...(editionId ? [{ value: "edition", label: editionName ?? t.scopeEdition }] : []),
                ]}
              />
            </Field>
          </div>
          <ModalFuss>
            <Button type="button" disabled={pending || !neueRolle} loading={pending} onClick={rolleVergeben}>
              {t.grant}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRolleFuer(null)}>
              {common.cancel}
            </Button>
          </ModalFuss>
        </Modal>
      )}
    </div>
  );
}
