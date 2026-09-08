import localFont from "next/font/local";

/**
 * Hauslizenz deckt Web-Einbettung ab (Entscheidungslog 08.09.2026).
 * Sharp Sans Display No1: SemiBold (600) = Textschnitt, ExtraBold (800) = Titel.
 * ABC Laica Regular Italic = Akzent-Moment (ein Wort/Halbsatz pro Screen).
 * Fallbacks sind gesetzt, `display: swap` verhindert unsichtbaren Text.
 */
export const sharpSans = localFont({
  src: [
    {
      path: "../public/fonts/SharpSansDisplayNo1-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/SharpSansDisplayNo1-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/SharpSansDisplayNo1-ExtraBold.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/SharpSansDisplayNo1-ExtraBoldItalic.woff2",
      weight: "800",
      style: "italic",
    },
  ],
  variable: "--font-sharp",
  display: "swap",
  fallback: ["-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

export const laica = localFont({
  src: "../public/fonts/ABCLaica-RegularItalic.woff2",
  weight: "400",
  style: "italic",
  variable: "--font-laica",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
