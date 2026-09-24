"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * QR-Code aus einem Ticket-Barcode. Gezeichnet wird im Browser auf ein
 * Canvas — der Wert geht damit weder durch eine URL noch durch ein
 * Server-Log. Gleiches Verfahren wie im Speaker-Portal (`/speaker/tickets`),
 * hierher gezogen für das Teilnehmer-Portal (TAL-015).
 *
 * Kann der Code nicht gezeichnet werden, steht `label` als Text da — der
 * Einlass kann den Barcode dann aus vivenu scannen.
 */
export function QrCode({ value, label, size = 220 }: { value: string; label: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, { width: size, margin: 1 }).catch(() => setFailed(true));
  }, [value, size]);

  if (failed) return <p className="ct-help">{label}</p>;
  return <canvas ref={ref} role="img" aria-label={label} className="rounded-ct-md border bg-white p-2" />;
}
