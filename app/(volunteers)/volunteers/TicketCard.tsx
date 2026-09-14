"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

type Strings = Record<string, string>;

/**
 * Die Ticket-Kachel. Einlösen ist der Aktivierungsschritt (Entscheidung E2) —
 * deshalb steht hier ein Knopf und kein „dein Ticket liegt bereit".
 *
 * Solange kein Code da ist, sagt die Kachel warum: angenommen, aber der Code
 * kommt noch. Ein leeres Feld mit „—" würde nur Rückfragen erzeugen.
 */
export function TicketCard({
  couponStatus,
  code,
  shopUrl,
  t,
}: {
  couponStatus: string;
  code: string | null;
  shopUrl: string | null;
  t: Strings;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader title={t.ticketTitle} description={t.ticketLead} />
      {couponStatus === "redeemed" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">{t.ticketRedeemed}</Badge>
          <span className="ct-help">{t.ticketRedeemedBody}</span>
        </div>
      ) : code ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <code className="ct-h3 rounded-ct-md border bg-surface-hover px-3 py-1.5 tracking-wider">{code}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Ohne Zwischenablage-Recht bleibt der Code zum Abtippen stehen.
                  setCopied(false);
                }
              }}
            >
              {copied ? t.copied : t.copy}
            </Button>
          </div>
          {shopUrl && <ButtonLink href={shopUrl}>{t.ticketRedeem}</ButtonLink>}
          <p className="ct-help">{t.ticketHint}</p>
        </div>
      ) : (
        <p className="ct-help">{t.ticketPending}</p>
      )}
    </Card>
  );
}
