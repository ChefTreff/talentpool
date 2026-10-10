import { getI18n } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { loginUrl } from "@/lib/areas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { AppHeader } from "@/components/layout/AppHeader";
import { PortalFooter, DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { gueltigeTransaktion } from "@/lib/vivenu/bestaetigung";
import { ladeTransaktion } from "@/lib/vivenu/transaktion";
import { anderesKonto } from "./actions";
import { BestaetigungView, type TicketZeile } from "./BestaetigungView";

export const dynamic = "force-dynamic";

/**
 * Ticket-Bestätigung nach dem Kauf (TAL-019, Welle 1 B4). vivenu leitet nach dem Kauf hierher und hängt `?transactionId=…`
 * an (Antwort 10.09.). Die Seite ist im Proxy öffentlich, prüft aber selbst:
 *
 * * **Ohne Anmeldung** steht nur eine Aufforderung zum Login da — die Transaktions-Id wird nirgends ausgegeben, nur in den
 *   Rücksprung des Login-Links gelegt.
 * * **Angemeldet:** `my_transaction_tickets` liefert die Tickets, deren Käufer-Adresse die Anmelde-Adresse ist. Fremde
 *   Adresse und unbekannte Transaktion sehen dasselbe (nichts) — keine Auskunft, ob es die Bestellung gibt.
 * * **Webhook noch nicht da:** dann lädt der Server die Transaktion bei vivenu, prüft vorher die Käufer-Adresse und schreibt
 *   über denselben Ingest (`lib/vivenu/transaktion.ts`).
 */
export default async function TicketBestaetigungPage({ searchParams }: { searchParams: Promise<{ transactionId?: string; tx?: string }> }) {
  const sp = await searchParams;
  const tx = gueltigeTransaktion(sp.transactionId ?? sp.tx);
  const { locale, t } = await getI18n();
  const b = t.ticketBestaetigung as unknown as Record<string, string>;
  const ctx = await getSessionContext();

  const huelle = (inhalt: React.ReactNode, loginHref?: string) => (
    <>
      <AppHeader loginHref={loginHref} />
      <main id="content" className="mx-auto w-full max-w-content flex-1 px-4 py-8 sm:px-6">
        <div className="max-w-text">{inhalt}</div>
      </main>
      <PortalFooter
        mailbox={DEFAULT_MAILBOX}
        mailboxLabel={t.common.supportMailbox}
        imprintLabel={t.common.imprint}
        privacyLabel={t.common.privacy}
      />
    </>
  );

  if (!tx) {
    return huelle(
      <>
        <PageHeader title={b.title} description={b.noLinkLead} />
        <ButtonLink href={ctx.user ? "/tickets" : "/login"}>{ctx.user ? b.toTickets : b.login}</ButtonLink>
      </>,
    );
  }

  if (!ctx.user) {
    const ziel = `/tickets/bestaetigung?transactionId=${encodeURIComponent(tx)}`;
    const zumLogin = loginUrl(ziel);
    return huelle(
      <>
        <PageHeader title={b.title} description={b.gateLead} />
        <Card>
          <p className="ct-small">{b.gateBody}</p>
          <div className="mt-4">
            <ButtonLink href={zumLogin}>{b.login}</ButtonLink>
          </div>
        </Card>
      </>,
      // Auch der Link der Kopfzeile führt mit Rücksprung zur Bestellung (TAL-020, B6).
      zumLogin,
    );
  }

  const supabase = await createSupabaseServerClient();
  let { data } = await supabase.rpc("my_transaction_tickets", { p_transaction_id: tx });
  let gedrosselt = false;
  if (((data ?? []) as unknown[]).length === 0) {
    const ergebnis = await ladeTransaktion(createSupabaseAdminClient(), tx, ctx.user.email);
    gedrosselt = ergebnis === "gedrosselt";
    if (ergebnis === "ok") ({ data } = await supabase.rpc("my_transaction_tickets", { p_transaction_id: tx }));
  }
  const zeilen = (data ?? []) as Omit<TicketZeile, "pass_label">[];

  if (zeilen.length === 0) {
    // Dieselbe neutrale Antwort für „noch nicht da“, „andere Adresse“ und „gibt es nicht“.
    return huelle(
      <>
        <PageHeader title={b.title} description={b.emptyLead} />
        <EmptyState title={b.emptyTitle} description={gedrosselt ? b.emptyWait : b.emptyBody} />
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href={`/tickets/bestaetigung?transactionId=${encodeURIComponent(tx)}`} variant="secondary">{b.reload}</ButtonLink>
          {/* Häufigster Fehlerfall: angemeldet mit einer anderen Adresse als der Kaufadresse (TAL-020, B6) — abmelden und mit derselben Bestellung zurück zur Anmeldung. */}
          <form action={anderesKonto.bind(null, tx)}>
            <Button type="submit" variant="ghost">{b.otherAccount}</Button>
          </form>
          <ButtonLink href="/tickets" variant="ghost">{b.toTickets}</ButtonLink>
        </div>
      </>,
    );
  }

  const [vocab, { data: person }] = await Promise.all([
    loadVocabMap(supabase, locale),
    supabase.from("person").select("first_name,last_name,employer_name,job_title").maybeSingle(),
  ]);
  const tickets: TicketZeile[] = zeilen.map((z) => ({ ...z, pass_label: z.pass_type ? vlabel(vocab, "ticket_type", z.pass_type) : b.ticket }));

  return huelle(
    <BestaetigungView
      tickets={tickets}
      profil={{
        first_name: person?.first_name ?? "",
        last_name: person?.last_name ?? "",
        company: (person as { employer_name?: string } | null)?.employer_name ?? "",
        job_position: (person as { job_title?: string } | null)?.job_title ?? "",
      }}
      t={b}
      rpcMessages={t.rpc}
      unsaved={t.common.unsaved}
    />,
  );
}
