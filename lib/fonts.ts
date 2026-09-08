import localFont from "next/font/local";

/**
 * Hauslizenz deckt Web-Einbettung ab (Entscheidungslog 08.09.2026).
 * Sharp Sans Display No1: SemiBold (600) = Textschnitt, ExtraBold (800) = Titel.
 * ABC Laica Regular Italic = Akzent-Moment (ein Wort/Halbsatz pro Screen).
 *
 * `preload` gilt in `next/font` je Aufruf, nicht je Schnitt. Deshalb liegen die
 * Kursiven in einer eigenen Familie: vorgeladen wird nur, was jede Seite braucht
 * (SemiBold + ExtraBold, ~105 KB); die drei kursiven Dateien (~175 KB) lädt der
 * Browser erst, wenn sie vorkommen — Highlight-Wort und Laica-Moment.
 */
export const sharpSans = localFont({
  src: [
    {
      path: "../public/fonts/SharpSansDisplayNo1-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/SharpSansDisplayNo1-ExtraBold.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-sharp",
  display: "swap",
  fallback: ["-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

/** Nur für das Highlight-Wort (Design-Briefing §3) — deshalb kein Preload. */
export const sharpSansItalic = localFont({
  src: [
    {
      path: "../public/fonts/SharpSansDisplayNo1-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/SharpSansDisplayNo1-ExtraBoldItalic.woff2",
      weight: "800",
      style: "italic",
    },
  ],
  variable: "--font-sharp-italic",
  display: "swap",
  preload: false,
  fallback: ["-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

export const laica = localFont({
  src: "../public/fonts/ABCLaica-RegularItalic.woff2",
  weight: "400",
  style: "italic",
  variable: "--font-laica",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
});
