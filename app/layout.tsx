import type { Metadata } from "next";
import { sharpSans, sharpSansItalic, laica } from "@/lib/fonts";
import { getI18n } from "@/lib/i18n";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

/** Auch der Tab-Titel folgt der Sprachwahl. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.title, description: t.meta.description };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Sprache: person.preferred_language → Cookie → Accept-Language → de.
  const { locale, t } = await getI18n();

  return (
    <html
      lang={locale}
      className={`${sharpSans.variable} ${sharpSansItalic.variable} ${laica.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-ct-md focus:bg-surface focus:px-4 focus:py-2"
        >
          {t.nav.skipToContent}
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
