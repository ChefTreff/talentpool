"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { useToast } from "./Toast";

/** Wie lange der Knopf „Kopiert" stehen lässt, bevor er wieder anbietet. */
const QUITTUNG_MS = 3000;

/**
 * Legt einen Text in die Zwischenablage und sagt es kurz.
 *
 * Der Knopf ist immer nur eine Abkürzung: `navigator.clipboard` fehlt ohne
 * sicheren Kontext und kann vom Browser verweigert werden. Der Text, den er
 * kopiert, muss deshalb auf der Seite lesbar danebenstehen und von Hand
 * markierbar sein — sonst wäre die Seite ohne Zwischenablage unbedienbar.
 *
 * Das Muster stand bis zum 21.09.2026 zweimal im Repo (Partner-Tickets,
 * Volunteer-Ticket). Neue Stellen nehmen diesen Knopf; die beiden alten
 * bleiben, wo sie sind — sie zeigen die Quittung in der Zeile statt im Knopf.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  variant = "secondary",
  size = "md",
  className,
}: {
  /** Was kopiert wird. */
  value: string;
  label: string;
  /** Beschriftung, solange die Quittung steht. */
  copiedLabel: string;
  /** Meldung, wenn der Browser die Zwischenablage verweigert. */
  failedLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const toast = useToast();
  const [kopiert, setKopiert] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setKopiert(true);
      toast("success", copiedLabel);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setKopiert(false), QUITTUNG_MS);
    } catch {
      toast("error", failedLabel);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={onCopy}>
      {kopiert ? copiedLabel : label}
    </Button>
  );
}
