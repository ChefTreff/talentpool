import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentEditionId } from "@/components/wiki/load";
import { toRpcFailure } from "@/lib/rpc-error";
import { verlaufAusBrowser } from "@/lib/speaker/titel-assistent";
import {
  kontextWaehlen,
  MAX_FRAGE_ZEICHEN,
  modellNachrichten,
  nichtImWiki,
  quellen,
  suchplan,
  systemText,
  trefferVereinen,
  type Treffer,
} from "@/lib/wiki/assistent";

export const dynamic = "force-dynamic";

/**
 * Eine Frage an die Wissensbasis — seit ADM-044 als Zug eines Gesprächs.
 *
 * Der Weg ist bewusst dreistufig, und die ersten beiden Stufen brauchen kein
 * Modell:
 *
 * 1. **Zähler** (`kb_take_question_slot`) — 20 Fragen je Person und Stunde, in
 *    der Datenbank gezählt. Im Speicher der Instanz gezählt wäre es kein Limit:
 *    jede Vercel-Region hätte ihren eigenen Zähler.
 * 2. **Suchen** (`kb_search`) — bei **jeder** Frage neu und nur in den
 *    Zielgruppen der Person; der Verlauf liefert höchstens Suchwörter dazu,
 *    eine englische Frage sucht zusätzlich deutsch zerlegt (`suchplan`).
 *    Findet nichts, ist die Antwort ein fester Satz. Ohne
 *    Quelle wird **nicht** gefragt: ein Modell, das ohne Beleg antwortet,
 *    klingt zuverlässig und ist es nicht. Das spart nebenbei den Aufruf.
 * 3. **Formulieren** — nur mit Treffern, nur aus ihnen.
 *
 * An Anthropic gehen die gefundenen Abschnitte und **dieses Gespräch**: die
 * Fragen der Person und die Antworten darauf, höchstens zwölf Züge. Der
 * Verlauf kommt aus dem Browser und wird wie beim Titel-Assistenten geprüft
 * (`verlaufAusBrowser`); gespeichert wird er nirgends. Kein Name, keine Rolle,
 * keine ID.
 */
const MODELL = process.env.CHATBOT_MODEL || "claude-sonnet-5";
const LIMIT_PRO_STUNDE = 20;

export async function POST(request: Request) {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { messages, question, audience, language } = (body ?? {}) as Record<string, unknown>;
  const sprache: "de" | "en" = language === "en" ? "en" : "de";
  // Ein Tab, der noch die Seite von vor ADM-044 zeigt, schickt `question`
  // allein — das ist ein Gespräch mit einem Zug.
  const verlauf = verlaufAusBrowser(
    messages ?? (typeof question === "string" ? [{ role: "user", content: question }] : null),
    MAX_FRAGE_ZEICHEN,
  );
  if (!verlauf || typeof audience !== "string" || audience === "") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const frage = verlauf[verlauf.length - 1].content.trim();
  const start = Date.now();

  // 1 · Zähler
  const { error: limitFehler } = await supabase.rpc("kb_take_question_slot", {
    p_limit: LIMIT_PRO_STUNDE,
  });
  if (limitFehler) {
    const f = toRpcFailure(limitFehler);
    const status = f.key === "rate_limited" ? 429 : 403;
    return NextResponse.json({ error: f.key }, { status });
  }

  // 2 · Suchen. Ohne die Edition bliebe die Fassung „für diese Edition" aus
  // dem Kontext — die Suche fände nur den evergreen, und die Antwort wäre
  // jedes Jahr die vom Vorjahr (Review Architektur-Session 17.09.).
  const editionId = await currentEditionId();
  const listen: Treffer[][] = [];
  for (const { anfrage, sprache: zerlegung } of suchplan(verlauf, sprache)) {
    const { data: rows, error: suchFehler } = await supabase.rpc("kb_search", {
      p_query: anfrage,
      p_audience: audience,
      p_language: zerlegung,
      p_edition_id: editionId,
    });
    if (suchFehler) {
      const f = toRpcFailure(suchFehler);
      // Nur Füllwörter („und dann?") ergeben keine Suche — im Gespräch kein
      // Fehler, die nächste Anfrage nimmt die Frage davor mit.
      if (f.key === "empty_query") continue;
      return NextResponse.json({ error: f.key }, { status: 403 });
    }
    listen.push((rows ?? []) as Treffer[]);
  }
  const treffer = trefferVereinen(listen);

  if (treffer.length === 0) {
    await supabase.rpc("kb_log_question", {
      p_audience: audience,
      p_language: sprache,
      p_question: frage,
      p_article_ids: [],
      p_hit: false,
      p_duration_ms: Date.now() - start,
    });
    return NextResponse.json({ hit: false, answer: null, sources: [] });
  }

  const kontext = kontextWaehlen(treffer);
  const belege = quellen(kontext);

  // 3 · Formulieren. Ohne Schlüssel bleibt der Assistent brauchbar: er zeigt
  // die gefundenen Abschnitte, nur eben ohne zusammengefasste Antwort.
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    await protokoll(supabase, audience, sprache, frage, kontext, start);
    return NextResponse.json({ hit: true, answer: null, sources: belege, no_model: true });
  }

  let antwort: string | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 600,
        system: systemText(sprache, audience),
        messages: modellNachrichten(verlauf, kontext, sprache),
      }),
      // Eine Frage ist eine Interaktion: wer 30 Sekunden wartet, hat das
      // Vertrauen verloren, bevor die Antwort kommt.
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error("[wiki/frage] Anthropic:", res.status, await res.text().catch(() => ""));
    } else {
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      antwort =
        (json.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("")
          .trim() || null;
    }
  } catch (fehler) {
    console.error("[wiki/frage] Anthropic:", fehler);
  }

  // Die Suche fand etwas, aber es deckt die Frage nicht: dann ist es ein
  // Fehltreffer. Links zu Artikeln, die nicht passen, hülfen niemandem, und im
  // Bericht soll die Frage als Lücke im Wiki stehen.
  if (antwort !== null && nichtImWiki(antwort)) {
    await protokoll(supabase, audience, sprache, frage, kontext, start, false);
    return NextResponse.json({ hit: false, answer: null, sources: [] });
  }

  await protokoll(supabase, audience, sprache, frage, kontext, start);
  return NextResponse.json({
    hit: true,
    answer: antwort,
    sources: belege,
    ...(antwort === null ? { no_model: true } : {}),
  });
}

/** Ohne wer: Zielgruppe, Sprache, Frage, gefundene Artikel, Dauer. */
async function protokoll(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  audience: string,
  sprache: string,
  frage: string,
  kontext: Treffer[],
  start: number,
  treffer = true,
) {
  const { error } = await supabase.rpc("kb_log_question", {
    p_audience: audience,
    p_language: sprache,
    p_question: frage,
    p_article_ids: [...new Set(kontext.map((t) => t.article_id))],
    p_hit: treffer,
    p_duration_ms: Date.now() - start,
  });
  if (error) console.error("[wiki/frage] kb_log_question:", error.message);
}
