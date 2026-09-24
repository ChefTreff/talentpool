"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  ANLAESSE,
  KANAELE,
  MAX_EINGABE_ZEICHEN,
  type Anlass,
  type Kanal,
  type Nachricht,
} from "@/lib/speaker/post-assistent";

type Strings = Record<string, string>;

/**
 * Den eigenen Beitrag im Gespräch schreiben (SPK-039).
 *
 * Konrad, 21.09.: auf „Deine Grafik" gehört neben die Vorlagen „ein
 * Post-Generator wie der Titel- und Beschreibungs-Assistent". Also dieselbe
 * Bauweise wie SPK-012 — bis auf zwei Unterschiede, die aus der Sache kommen:
 *
 * **Anlass und Kanal stehen vorn, nicht im Gespräch.** Ob der Beitrag ankündigt
 * oder zurückblickt und ob er auf LinkedIn oder Instagram erscheint, bestimmt
 * Länge und Ton komplett. Das erst im Dialog zu erfragen, kostet zwei Züge für
 * etwas, das mit einem Klick feststeht.
 *
 * **Am Ende steht Kopieren, nicht Übernehmen.** Beim Titel gibt es ein Feld,
 * in das der Vorschlag wandert. Ein Beitrag gehört in ein fremdes Netzwerk —
 * wir haben kein Feld dafür und sollten auch keins bauen.
 *
 * Die Vorlagen daneben bleiben: wer nur schnell etwas Fertiges braucht, nimmt
 * sie. Der Generator ist für die, die etwas Eigenes sagen wollen.
 */
export function PostGenerator({
  sessions,
  language,
  t,
}: {
  /** Die eigenen Sessions mit Titel — ohne Titel gibt es nichts zu beschreiben. */
  sessions: { id: string; titel: string; event: string | null }[];
  language: "de" | "en";
  t: Strings;
}) {
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [anlass, setAnlass] = useState<Anlass>("announce");
  const [kanal, setKanal] = useState<Kanal>("linkedin");
  const [verlauf, setVerlauf] = useState<Nachricht[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [post, setPost] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const endeRef = useRef<HTMLDivElement | null>(null);

  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0] ?? null;

  async function senden() {
    const text = eingabe.trim();
    if (!text || laeuft) return;

    const neu: Nachricht[] = [...verlauf, { role: "user", content: text }];
    setVerlauf(neu);
    setEingabe("");
    setHinweis(null);
    setLaeuft(true);
    try {
      const res = await fetch("/api/speaker/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: neu,
          language,
          occasion: anlass,
          channel: kanal,
          title: session?.titel ?? null,
          event: session?.event ?? null,
        }),
      });
      if (res.status === 429) {
        setHinweis(t.rateLimited);
        return;
      }
      if (!res.ok) {
        setHinweis(t.failed);
        return;
      }
      const json = (await res.json()) as {
        answer: string | null;
        post: string | null;
        no_model?: boolean;
        failed?: boolean;
      };
      if (json.no_model) {
        setHinweis(t.noModel);
        return;
      }
      if (json.failed || !json.answer) {
        setHinweis(t.failed);
        return;
      }
      setVerlauf((v) => [...v, { role: "assistant", content: json.answer as string }]);
      if (json.post) setPost(json.post);
      requestAnimationFrame(() => endeRef.current?.scrollIntoView({ block: "nearest" }));
    } catch {
      setHinweis(t.failed);
    } finally {
      setLaeuft(false);
    }
  }

  // Ohne Vortragstitel hätte der Beitrag kein Thema — dann sagt die Karte das,
  // statt ein Gespräch anzubieten, das im Leeren endet.
  if (sessions.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.genTitle}</h2>
        <p className="ct-help">{t.genNoSession}</p>
      </Card>
    );
  }

  if (!offen) {
    return (
      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.genTitle}</h2>
        <p className="ct-help">{t.genTeaser}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => setOffen(true)}>
          {t.genOpen}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ct-h3 text-ink">{t.genTitle}</h2>
        <Button variant="ghost" size="sm" onClick={() => setOffen(false)}>
          {t.genClose}
        </Button>
      </div>
      <p className="ct-help mt-1">{t.genIntro}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {sessions.length > 1 && (
          <Field label={t.genSession} htmlFor="pg-session">
            <Select
              id="pg-session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              options={sessions.map((s) => ({ value: s.id, label: s.titel }))}
            />
          </Field>
        )}
        <Field label={t.genOccasion} htmlFor="pg-anlass">
          <Select
            id="pg-anlass"
            value={anlass}
            onChange={(e) => setAnlass(e.target.value as Anlass)}
            options={ANLAESSE.map((a) => ({ value: a, label: t[`${a}Label`] ?? a }))}
          />
        </Field>
        <Field label={t.genChannel} htmlFor="pg-kanal">
          <Select
            id="pg-kanal"
            value={kanal}
            onChange={(e) => setKanal(e.target.value as Kanal)}
            options={KANAELE.map((k) => ({ value: k, label: t[`channel_${k}`] ?? k }))}
          />
        </Field>
      </div>

      {verlauf.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" aria-live="polite">
          {verlauf.map((m, i) => (
            <li
              key={i}
              className={
                m.role === "user"
                  ? "rounded-ct-md bg-canvas p-3 ct-small"
                  : "rounded-ct-md border border-accent-soft bg-accent-soft p-3 ct-small text-accent-deep"
              }
            >
              <span className="ct-help block">{m.role === "user" ? t.you : t.assistant}</span>
              <span className="whitespace-pre-line">{m.content}</span>
            </li>
          ))}
          <div ref={endeRef} />
        </ul>
      )}

      {post && (
        <div className="mt-4 rounded-ct-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="accent">{t.genResult}</Badge>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(post)
                  .then(() => toast("success", t.copied))
                  .catch(() => toast("error", t.copyFailed));
              }}
            >
              {t.copy}
            </Button>
          </div>
          <p className="ct-small mt-2 whitespace-pre-line leading-6">{post}</p>
          <p className="ct-help mt-2">{t.genCheck}</p>
        </div>
      )}

      {hinweis && (
        <p role="alert" className="mt-4 rounded-ct-md border bg-canvas p-3 ct-small">
          {hinweis}
        </p>
      )}

      <div className="mt-4">
        <label className="ct-label" htmlFor="pg-eingabe">
          {verlauf.length === 0 ? t.genFirstPrompt : t.genNextPrompt}
        </label>
        <Textarea
          id="pg-eingabe"
          rows={3}
          className="mt-2"
          maxLength={MAX_EINGABE_ZEICHEN}
          value={eingabe}
          placeholder={verlauf.length === 0 ? t.genPlaceholder : t.genPlaceholderNext}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => {
            // Absenden mit Strg/Cmd + Enter: ein Textfeld mit mehreren Zeilen
            // darf nicht bei jedem Enter abschicken.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void senden();
            }
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void senden()} loading={laeuft} disabled={!eingabe.trim()}>
            {verlauf.length === 0 ? t.genStart : t.genRefine}
          </Button>
          {verlauf.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={laeuft}
              onClick={() => {
                setVerlauf([]);
                setPost(null);
                setHinweis(null);
              }}
            >
              {t.genReset}
            </Button>
          )}
        </div>
        <p className="ct-help mt-3">{t.genPrivacy}</p>
      </div>
    </Card>
  );
}
