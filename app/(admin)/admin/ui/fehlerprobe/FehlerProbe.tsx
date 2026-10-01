"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** Die beiden Auslöser der Fehlerprobe; Erklärung in `page.tsx`. */
export function FehlerProbe({
  serverHref,
  t,
}: {
  serverHref: string;
  t: { server: string; browser: string };
}) {
  const [kaputt, setKaputt] = useState(false);
  if (kaputt) {
    throw new Error(
      'Fehlerprobe im Browser: duplicate key value violates unique constraint "zz_geheim_pkey" (erfundenes Serverdetail)',
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap gap-3">
        {/* Ohne Vorladen: der Link soll erst beim Klick werfen, nicht schon,
            wenn er im Bild erscheint. */}
        <ButtonLink href={serverHref} variant="secondary" prefetch={false}>
          {t.server}
        </ButtonLink>
        <Button variant="secondary" onClick={() => setKaputt(true)}>
          {t.browser}
        </Button>
      </div>
    </Card>
  );
}
