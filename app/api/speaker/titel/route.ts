import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  anfrageBauen,
  antwortOhneBlock,
  vorschlagLesen,
  verlaufAusBrowser,
} from "@/lib/speaker/titel-assistent";

export const dynamic = "force-dynamic";

/**
 * Der Titel-Assistent (SPK-012).
 *
 * Konrad am 17.09.: „Speaker tun sich mit Titel und Beschreibung schwer" —
 * Chat-Oberfläche, Vorschlag, im Dialog schärfen, geschärft an den Titeln von
 * 2026.
 *
 * Der Weg ist derselbe wie beim Wiki-Assistenten, und zwar mit Absicht: die
 * Technik ist erprobt, und zwei Assistenten mit zwei Bauweisen wären zwei
 * Stellen, an denen die Regeln auseinanderlaufen.
 *
 * 1. **Zähler** (`ai_take_slot`) — zehn Gespräche je Person und Stunde, in der
 *    Datenbank gezählt. Im Speicher der Instanz gezählt wäre es kein Limit.
 *    Gezählt wird **vor** dem Modellaufruf: wer erst danach zählt, hat die
 *    Kosten schon, wenn die Bremse greift.
 * 2. **Formulieren** — mit den Beispielen aus dem Programm 2026.
 *
 * **An Anthropic gehen ausschliesslich das Format, die Sprache und das, was der
 * Mensch selbst über seinen Inhalt schreibt.** Kein Name, keine Organisation,
 * keine Kennung, keine Mailadresse, kein Slot. Der Verlauf kommt vom Browser
 * und wird auf die letzten Züge gekürzt.
 *
 * Ohne `ANTHROPIC_API_KEY` bleibt die Seite brauchbar: sie sagt, dass der
 * Assistent gerade nicht antwortet, statt einen Fehler zu werfen.
 */
const MODELL = process.env.CHATBOT_MODEL || "claude-sonnet-5";
const LIMIT_PRO_STUNDE = 10;
const ART = "speaker_title";

export async function POST(request: Request) {
  await requireArea("speaker", "/speaker/session");
  const supabase = await createSupabaseServerClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { messages, language, format } = (body ?? {}) as Record<string, unknown>;
  const sprache: "de" | "en" = language === "de" ? "de" : "en";
  const formatKey = typeof format === "string" && format ? format : null;

  // Jeder Zug wird geprüft, auch der angebliche des Assistenten: der ganze
  // Verlauf kommt aus dem Browser (siehe `verlaufAusBrowser`).
  const verlauf = verlaufAusBrowser(messages);
  if (!verlauf) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // 1 · Zähler
  const { error: limitFehler } = await supabase.rpc("ai_take_slot", {
    p_kind: ART,
    p_limit: LIMIT_PRO_STUNDE,
  });
  if (limitFehler) {
    const f = toRpcFailure(limitFehler);
    return NextResponse.json({ error: f.key }, { status: f.key === "rate_limited" ? 429 : 403 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ answer: null, suggestion: null, no_model: true });

  // 2 · Formulieren
  const { system, messages: gekuerzt } = anfrageBauen(verlauf, sprache, formatKey);
  let roh: string | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODELL, max_tokens: 900, system, messages: gekuerzt }),
      // Wie beim Wiki-Assistenten: wer 30 Sekunden wartet, hat das Vertrauen
      // verloren, bevor die Antwort kommt.
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.error("[speaker/titel] Anthropic:", res.status, await res.text().catch(() => ""));
    } else {
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      roh =
        (json.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("")
          .trim() || null;
    }
  } catch (fehler) {
    console.error("[speaker/titel] Anthropic:", fehler);
  }

  if (!roh) return NextResponse.json({ answer: null, suggestion: null, failed: true });

  return NextResponse.json({
    answer: antwortOhneBlock(roh),
    suggestion: vorschlagLesen(roh),
  });
}
