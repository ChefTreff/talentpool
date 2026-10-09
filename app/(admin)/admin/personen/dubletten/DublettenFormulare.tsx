"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { findePaar, fuehreZusammen, nimmZurueck, suchenDubletten } from "./actions";

type Strings = Record<string, string>;
const meldung = (rpc: Strings, key: string) => rpc[key] ?? rpc.unknown ?? key;

/** Dublettensuche über alle Personen (ADM-036). Ändert nur die Kandidatenliste. */
export function SuchKnopf({ t, rpcMessages }: { t: Strings; rpcMessages: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await suchenDubletten();
          if (!r.ok) { toast("error", meldung(rpcMessages, r.key)); return; }
          toast("success", t.scanDone.replace("{n}", String(r.neu)));
          router.refresh();
        })
      }
    >
      {t.scan}
    </Button>
  );
}

/** Zwei Personen von Hand gegenüberstellen — führt zur Vorschau, ändert nichts. */
export function PaarFormular({ t, rpcMessages }: { t: Strings; rpcMessages: Strings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erste, setErste] = useState("");
  const [zweite, setZweite] = useState("");
  const [fehler, setFehler] = useState<{ feld: 1 | 2; text: string } | null>(null);

  function vergleichen(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await findePaar(erste, zweite);
      if (!r.ok) { setFehler({ feld: r.feld ?? 1, text: meldung(rpcMessages, r.key) }); return; }
      setFehler(null);
      router.push(`/admin/personen/dubletten/zusammenfuehren?bleibt=${r.a}&geht=${r.b}`);
    });
  }

  return (
    <Card className="mt-6">
      <CardHeader ebene="h2" title={t.pairTitle} description={t.pairLead} />
      <form onSubmit={vergleichen} className="flex flex-wrap items-end gap-3">
        <Field label={t.pairFirst} htmlFor="dub-a" error={fehler?.feld === 1 ? fehler.text : undefined}>
          <Input id="dub-a" className="w-72" value={erste} onChange={(e) => setErste(e.target.value)} />
        </Field>
        <Field label={t.pairSecond} htmlFor="dub-b" error={fehler?.feld === 2 ? fehler.text : undefined}>
          <Input id="dub-b" className="w-72" value={zweite} onChange={(e) => setZweite(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={pending} disabled={pending || !erste.trim() || !zweite.trim()}>
          {t.pairAction}
        </Button>
      </form>
    </Card>
  );
}

/** Zusammenführen mit Rückfrage — nur ohne Hindernis (die Vorschau sperrt den Knopf sonst). */
export function ZusammenfuehrenKnopf({
  bleibt,
  geht,
  name,
  ziel,
  gesperrt,
  t,
  common,
  rpcMessages,
}: {
  bleibt: string;
  geht: string;
  name: string;
  ziel: string;
  gesperrt: boolean;
  t: Strings;
  common: { cancel: string };
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <>
      <Button disabled={gesperrt || pending} loading={pending} onClick={() => setFrage(true)}>
        {t.mergeAction}
      </Button>
      {fehler && <p className="ct-small mt-2 text-error-ink" role="alert">{fehler}</p>}
      {frage && (
        <ConfirmDialog
          title={t.confirmTitle}
          body={t.confirmBody.replace("{geht}", name).replace("{bleibt}", ziel)}
          confirmLabel={t.mergeAction}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setFrage(false)}
          onConfirm={() =>
            start(async () => {
              const r = await fuehreZusammen(bleibt, geht);
              setFrage(false);
              if (!r.ok) { setFehler(meldung(rpcMessages, r.key)); return; }
              toast("success", t.mergeDone);
              router.push("/admin/personen/dubletten");
            })
          }
        />
      )}
    </>
  );
}

/** Rückweg einer Zusammenführung mit Rückfrage. */
export function Rueckweg({
  logId,
  name,
  t,
  common,
  rpcMessages,
}: {
  logId: string;
  name: string;
  t: Strings;
  common: { cancel: string };
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [frage, setFrage] = useState(false);

  return (
    <>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setFrage(true)}>
        {t.undo}
      </Button>
      {frage && (
        <ConfirmDialog
          title={t.undoTitle}
          body={t.undoBody.replace("{name}", name)}
          confirmLabel={t.undo}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setFrage(false)}
          onConfirm={() =>
            start(async () => {
              const r = await nimmZurueck(logId);
              setFrage(false);
              if (!r.ok) { toast("error", meldung(rpcMessages, r.key)); return; }
              toast("success", t.undoDone.replace("{name}", name));
              router.refresh();
            })
          }
        />
      )}
    </>
  );
}
