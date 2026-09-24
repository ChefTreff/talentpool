"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { TicketCard as KitTicketCard } from "@/components/ui/TicketCard";
import { neuesFenster } from "@/components/ui/neues-fenster";

type Strings = Record<string, string>;

/**
 * Das Ticket der Volunteers. Einlösen ist der Aktivierungsschritt
 * (Entscheidung E2) — deshalb steht hier ein Knopf und kein „dein Ticket
 * liegt bereit".
 *
 * **Der Fall mit Code trägt die Ticket-Form** aus dem Design-System, dieselbe
 * wie die Partner-Kontingente und das Speaker-Ticket: Was ein Ticket ist,
 * sieht überall gleich aus. Die beiden anderen Fälle bleiben eine schlichte
 * Karte — ein Code, der noch nicht da ist, und ein Ticket, das schon im
 * Postfach liegt, sind kein Ticket auf dieser Seite.
 *
 * Diese Datei heißt weiterhin `TicketCard`, hat aber nichts mit dem
 * gleichnamigen Kit-Baustein zu tun: sie ist die **Seite** um ihn herum, mit
 * Code, Zwischenablage und Einlöse-Weg. Der Kit-Baustein wird als
 * `KitTicketCard` hereingeholt, damit im Code nie unklar ist, welcher der
 * beiden gemeint ist.
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

  async function onCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Code zum Abtippen stehen.
      setCopied(false);
    }
  }

  if (couponStatus === "redeemed") {
    return (
      <Card>
        <CardHeader title={t.ticketTitle} description={t.ticketLead} />
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">{t.ticketRedeemed}</Badge>
          <span className="ct-help">{t.ticketRedeemedBody}</span>
        </div>
      </Card>
    );
  }

  if (!code) {
    return (
      <Card>
        <CardHeader title={t.ticketTitle} description={t.ticketLead} />
        <p className="ct-help">{t.ticketPending}</p>
      </Card>
    );
  }

  return (
    <KitTicketCard
      passType={t.areaName ?? t.ticketTitle}
      title={t.ticketTitle}
      status={<Badge tone="accent">{t.ticketOpen ?? t.ticketRedeem}</Badge>}
      footer={
        <div className="flex flex-col gap-3">
          <p className="ct-help">{t.ticketLead}</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="ct-h3 rounded-ct-md border bg-surface-hover px-3 py-1.5 tracking-wider">
              {code}
            </code>
            <Button size="sm" variant="secondary" onClick={() => onCopy(code)}>
              {copied ? t.copied : t.copy}
            </Button>
          </div>
          {shopUrl && (
            <ButtonLink href={shopUrl} {...neuesFenster}>
              {t.ticketRedeem}
            </ButtonLink>
          )}
          <p className="ct-help">{t.ticketHint}</p>
        </div>
      }
    />
  );
}
