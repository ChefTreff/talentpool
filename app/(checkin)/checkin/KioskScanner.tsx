"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { scanAction, type ScanResult } from "./actions";

type Strings = Record<string, string>;

/** Wie lange ein Ergebnis stehen bleibt, bevor wieder gescannt wird. */
const ERGEBNIS_MS = 2500;
/** Derselbe Code wird in diesem Fenster nicht erneut eingeschickt. */
const ENTPRELLEN_MS = 4000;

type Anzeige = ScanResult & { code: string };

/**
 * Das Kiosk am Einlass.
 *
 * Die Kamera liefert Bilder, `jsQR` liest den Code, die Antwort kommt aus
 * `checkin_scan()`. Drei Dinge sind hier Absicht:
 *
 *   * **Ergebnis gross und in Worten.** Die Ampelfarbe steht daneben, nicht
 *     statt des Textes — am Eingang steht man im Gegenlicht, und wer die Farbe
 *     nicht unterscheiden kann, liest „Willkommen" oder „Schon eingecheckt".
 *   * **Entprellen.** Ein QR-Code im Bild wird 30-mal je Sekunde erkannt. Ohne
 *     Sperre liefe derselbe Code als Dutzend `duplicate`-Zeilen in die
 *     Datenbank, und das Ergebnis flackerte.
 *   * **Feld zum Tippen.** Eine Kamera, die im Gegenlicht nicht scharf wird,
 *     ist an der Tür eine Warteschlange. Der Code steht auch als Text auf dem
 *     Ticket.
 */
export function KioskScanner({
  device,
  t,
  passLabels,
}: {
  device: string;
  t: Strings;
  /** Beschriftungen der Pass-Typen aus dem Vokabular. */
  passLabels: Record<string, string>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [kamera, setKamera] = useState<"aus" | "an" | "abgelehnt">("aus");
  const [anzeige, setAnzeige] = useState<Anzeige | null>(null);
  const [tippen, setTippen] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [zaehler, setZaehler] = useState(0);

  // Refs statt State: die Schleife läuft ausserhalb von React und darf keinen
  // Render auslösen, nur um sich zu merken, was sie zuletzt gesehen hat.
  const letzterCode = useRef<{ code: string; zeit: number } | null>(null);
  const beschaeftigt = useRef(false);

  const senden = useCallback(
    async (code: string) => {
      if (beschaeftigt.current) return;
      const jetzt = Date.now();
      const letzter = letzterCode.current;
      if (letzter && letzter.code === code && jetzt - letzter.zeit < ENTPRELLEN_MS) return;
      letzterCode.current = { code, zeit: jetzt };

      beschaeftigt.current = true;
      setLaeuft(true);
      try {
        const res = await scanAction(code, device);
        setAnzeige({ ...res, code });
        if (res.status === "ok") setZaehler((n) => n + 1);
      } finally {
        beschaeftigt.current = false;
        setLaeuft(false);
      }
    },
    [device],
  );

  // Kamera an, Bilder lesen. Läuft, bis die Seite verlassen wird.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let gestoppt = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (gestoppt) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setKamera("an");
        lesen();
      } catch {
        setKamera("abgelehnt");
      }
    }

    function lesen() {
      frame = requestAnimationFrame(lesen);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const bild = ctx.getImageData(0, 0, w, h);
      const code = jsQR(bild.data, w, h, { inversionAttempts: "dontInvert" });
      if (code?.data) void senden(code.data.trim());
    }

    void start();
    return () => {
      gestoppt = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [senden]);

  // Ergebnis wieder wegräumen, damit die nächste Person eine leere Fläche sieht.
  useEffect(() => {
    if (!anzeige) return;
    const id = setTimeout(() => setAnzeige(null), ERGEBNIS_MS);
    return () => clearTimeout(id);
  }, [anzeige]);

  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="ct-h1">{t.title}</h1>
        <p className="ct-h2" aria-live="polite">
          {zaehler} <span className="ct-help">{t.counted}</span>
        </p>
      </header>

      <div className="relative flex-1 overflow-hidden rounded-ct-lg border bg-surface">
        {/* `playsInline` — iOS spielt sonst im Vollbild ab und verdeckt alles. */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover"
          aria-label={t.cameraLabel}
        />
        <canvas ref={canvasRef} className="hidden" />

        {kamera === "abgelehnt" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="ct-help max-w-sm">{t.cameraDenied}</p>
          </div>
        )}

        {anzeige && <Ergebnis anzeige={anzeige} t={t} passLabels={passLabels} />}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const code = tippen.trim();
          if (!code) return;
          // Von Hand getippt heisst: es war Absicht. Die Sperre gilt hier nicht.
          letzterCode.current = null;
          void senden(code);
          setTippen("");
        }}
      >
        <Field label={t.manualLabel} htmlFor="kiosk-code" hint={t.manualHint} className="flex-1">
          <Input
            id="kiosk-code"
            value={tippen}
            onChange={(e) => setTippen(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
          />
        </Field>
        <Button type="submit" disabled={laeuft || tippen.trim() === ""}>
          {t.manualSubmit}
        </Button>
      </form>
    </div>
  );
}

/** Farben je Ausgang. Der Wortlaut steht immer daneben (§4). */
const flaechen: Record<string, string> = {
  ok: "bg-success-soft text-success-ink",
  already: "bg-warning-soft text-warning-ink",
  invalid: "bg-error-soft text-error-ink",
  unknown: "bg-error-soft text-error-ink",
  error: "bg-surface text-ink",
};

function Ergebnis({
  anzeige,
  t,
  passLabels,
}: {
  anzeige: Anzeige;
  t: Strings;
  passLabels: Record<string, string>;
}) {
  const zeit = anzeige.checkedInAt
    ? new Date(anzeige.checkedInAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn("absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center", flaechen[anzeige.status])}
    >
      <p className="ct-display">{t[`status_${anzeige.status}`] ?? t.status_error}</p>
      {anzeige.holderName && <p className="ct-h2">{anzeige.holderName}</p>}
      {anzeige.passType && <Badge>{passLabels[anzeige.passType] ?? anzeige.passType}</Badge>}
      {anzeige.status === "already" && zeit && (
        <p className="ct-help">{t.sinceLabel.replace("{time}", zeit)}</p>
      )}
      {anzeige.status === "error" && anzeige.message && <p className="ct-help">{anzeige.message}</p>}
    </div>
  );
}
