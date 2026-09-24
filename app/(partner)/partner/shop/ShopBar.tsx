"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SuchFeld } from "@/components/ui/SuchFeld";

/**
 * Suche links, Warenkorb rechts — die Anordnung, die jeder Shop hat.
 *
 * Konrad: „Intuitiv sucht man den Warenkorb oben rechts, das kennt man so von
 * normalen E-Commerce Plattformen." Genau deshalb steht er dort und nicht am
 * Seitenende, wo er vorher stand.
 *
 * Der Suchbegriff lebt in der Adresse (`?q=`), nicht im Zustand: dann
 * funktionieren Zurück-Knopf und geteilter Link, und die Produktseite kann
 * auf die Trefferliste zurückführen.
 */
export function ShopBar({
  count,
  searchLabel,
  searchPlaceholder,
  cartLabel,
}: {
  count: number;
  searchLabel: string;
  searchPlaceholder: string;
  cartLabel: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [gesehen, setGesehen] = useState(initial);

  // Adresse gewinnt: wer über einen Link kommt oder zurückgeht, sieht den
  // Begriff, der wirklich gilt. Angepasst **während** des Renderns, nicht im
  // Effekt — React rendert dann sofort neu, statt erst ein falsches Feld zu
  // zeigen und danach zu korrigieren.
  if (gesehen !== initial) {
    setGesehen(initial);
    setQ(initial);
  }

  // Tippen und Springen nicht im selben Atemzug: erst nach einer kurzen Pause
  // wird die Adresse gesetzt, sonst rauscht jede Taste durch den Router.
  useEffect(() => {
    if (q === initial) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q.trim() === "") next.delete("q");
      else next.set("q", q.trim());
      const query = next.toString();
      router.replace(`/partner/shop${query ? `?${query}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, initial, params, router]);

  const imKorb = pathname === "/partner/shop/warenkorb";

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor="shop-suche" className="ct-label text-ink">
          {searchLabel}
        </label>
        <SuchFeld
          id="shop-suche"
          value={q}
          placeholder={searchPlaceholder}
          onChange={(e) => setQ(e.target.value)}
          className="mt-1"
        />
      </div>

      {/* Der Korb ist der einzige Weg zum Warenkorb; deshalb zeigt er auch,
          wenn man schon darin ist — sonst stünde man dort ohne Markierung. */}
      <Link
        href="/partner/shop/warenkorb"
        aria-current={imKorb ? "page" : undefined}
        className={
          "flex min-h-11 items-center gap-2 rounded-ct-sm border px-3 ct-label transition-colors " +
          (imKorb
            ? "border-accent-soft bg-accent-soft text-accent-deep"
            : "border-border-strong text-ink hover:bg-surface-hover")
        }
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2.5 3h2l2 9.5h9l2-7H6" />
          <circle cx="8" cy="16" r="1.2" />
          <circle cx="15" cy="16" r="1.2" />
        </svg>
        <span>{cartLabel}</span>
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 ct-help tabular-nums text-surface">
            {count}
          </span>
        )}
      </Link>
    </div>
  );
}
