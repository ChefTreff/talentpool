import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentEditionId } from "@/components/wiki/load";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  frageOk,
  kontextWaehlen,
  nachricht,
  quellen,
  systemText,
  type Treffer,
} from "@/lib/wiki/assistent";

export const dynamic = "force-dynamic";

/**
 * Eine Frage an die Wissensbasis.
 *
 * Der Weg ist bewusst dreistufig, und die ersten beiden Stufen brauchen kein
 * Modell:
 *
 * 1. **Zähler** (`kb_take_question_slot`) — 20 Fragen je Person und Stunde, in
 *    der Datenbank gezählt. Im Speicher der Instanz gezählt wäre es kein Limit:
 *    jede Vercel-Region hätte ihren eigenen Zähler.
 * 2. **Suchen** (`kb_search`) — findet nichts, ist die Antwort ein fester Satz.
 *    Ohne Quelle wird **nicht** gefragt: ein Modell, das ohne Beleg antwortet,
 *    klingt zuverlässig und ist es nicht. Das spart nebenbei den Aufruf.
 * 3. **Formulieren** — nur mit Treffern, nur aus ihnen.
 *
 * An Anthropic gehen ausschließlich die Frage und die gefundenen Abschnitte.
 * Kein Name, keine Rolle, keine ID, kein Verlauf.
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
  const { question, audience, language } = (body ?? {}) as Record<string, unknown>;
  const sprache: "de" | "en" = language === "en" ? "en" : "de";
  if (!frageOk(question) || typeof audience !== "string" || audience === "") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const frage = question.trim();
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
  const { data: rows, error: suchFehler } = await supabase.rpc("kb_search", {
    p_query: frage,
    p_audience: audience,
    p_language: sprache,
    p_edition_id: await currentEditionId(),
  });
  if (suchFehler) {
    const f = toRpcFailure(suchFehler);
    return NextResponse.json({ error: f.key }, { status: f.key === "empty_query" ? 400 : 403 });
  }
  const treffer = (rows ?? []) as Treffer[];

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
        messages: [{ role: "user", content: nachricht(frage, kontext, sprache) }],
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
) {
  const { error } = await supabase.rpc("kb_log_question", {
    p_audience: audience,
    p_language: sprache,
    p_question: frage,
    p_article_ids: [...new Set(kontext.map((t) => t.article_id))],
    p_hit: true,
    p_duration_ms: Date.now() - start,
  });
  if (error) console.error("[wiki/frage] kb_log_question:", error.message);
}
