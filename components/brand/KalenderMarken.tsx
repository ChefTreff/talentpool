/**
 * Die Markenzeichen der drei Kalender (SPK-026, Konrad 22.09.: „Logos von
 * Apple etc. bitte die echten nehmen").
 *
 * **Warum hier und nicht in `components/ui`:** das sind fremde Marken, keine
 * Bausteine unseres Systems. Sie tauchen genau dort auf, wo wir auf den Dienst
 * verweisen, und nirgends sonst.
 *
 * **Warum rohe Farbwerte:** ein Markenzeichen hat seine Farbe, unsere Tokens
 * können sie nicht ausdrücken. Das ist die einzige Stelle im Portal, an der
 * Hex-Werte stehen dürfen — in der PR benannt, wie der Design-Skill es
 * verlangt.
 *
 * Herkunft: Google und Apple als Pfad aus Simple Icons (CC0). Microsoft hat
 * seine Zeichen dort entfernen lassen; das Viereck aus vier Quadraten ist
 * geometrisch eindeutig und hier exakt nachgebaut. Die Marken gehören ihren
 * Inhabern; wir benutzen sie nur, um auf deren Dienst zu zeigen.
 */

const GROESSE = "h-4 w-4 shrink-0";

export function GoogleKalenderMarke() {
  return (
    <svg viewBox="0 0 24 24" className={GROESSE} aria-hidden fill="#4285F4">
      <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" />
    </svg>
  );
}

/** Das Microsoft-Viereck: vier gleich grosse Quadrate mit einer Lücke. */
export function MicrosoftMarke() {
  return (
    <svg viewBox="0 0 24 24" className={GROESSE} aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export function AppleMarke() {
  return (
    <svg viewBox="0 0 24 24" className={GROESSE} aria-hidden fill="#000000">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}
