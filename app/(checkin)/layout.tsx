import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * Das Kiosk hat **kein** Gerüst: keine Sidebar, keine Kopfzeile, kein
 * Umschalter (B4). Ein Tablet steht im Vollbild am Eingang; jeder Punkt, der
 * woandershin führt, ist dort ein Fehlgriff in der Schlange.
 *
 * Das Gate sitzt in der Seite (`requireArea("checkin")`), nicht hier — so
 * bleibt die Rollenprüfung dort, wo auch die Daten geholt werden.
 */
export default function CheckinLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}
