import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  anfrageBauen,
  antwortOhneBlock,
  eingabeOk,
  istAnlass,
  istKanal,
  postLesen,
  type Nachricht,
} from "@/lib/speaker/post-assistent";

export const dynamic = "force-dynamic";

/**
 * Der Post-Generator (SPK-039).
 *
 * Derselbe Weg wie der Titel-Assistent (SPK-012), und zwar mit Absicht: die
 * Technik ist erprobt, und zwei Assistenten mit zwei Bauweisen wären zwei
 * Stellen, an denen die Regeln auseinanderlaufen.
 *
 * 1. **Zähler** (`ai_take_slot`) — zehn Gespräche je Person und Stunde, in der
 *    Datenbank gezählt; im Speicher der Instanz wäre es kein Limit. Gezählt
 *    wird **vor** dem Modellaufruf: wer erst danach zählt, hat die Kosten
 *    schon, wenn die Bremse greift. Eigene Art (`speaker_post`), damit ein
 *    langes Gespräch über den Titel den Post nicht aussperrt.
 * 2. **Formulieren** — mit Anlass, Kanal, Vortragstitel und Veranstaltung.
 *
 * **Titel und Veranstaltung gehen mit, Personendaten nicht.** Kein Name, keine
 * Organisation, kein Jobtitel, keine Kennung, keine Mailadresse, kein Slot. Der
 * Titel ist der eigene Text der Speakerin, der Name der Veranstaltung steht auf
 * jedem Plakat — ohne beides wäre der Beitrag leer.
 *
 * Ohne `ANTHROPIC_API_KEY` bleibt die Seite brauchbar: sie sagt, dass der
 * Assistent gerade nicht antwortet, statt einen Fehler zu werfen.
 */
const MODELL = process.env.CHATBOT_MODEL || "claude-sonnet-5";
const LIMIT_PRO_STUNDE = 10;
const ART = "speaker_post";
/** Ein Beitrag ist kurz; mehr Spielraum verführt nur zu Textwänden. */
const MAX_TOKENS = 900;

export async function POST(request: Request) {
  await requireArea("speaker", "/speaker/grafik");
  const supabase = await createSupabaseServerClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { messages, language, occasion, channel, title, event } = (body ?? {}) as Record<
    string,
    unknown
  >;
  const sprache: "de" | "en" = language === "de" ? "de" : "en";
  if (!istAnlass(occasion) || !istKanal(channel)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // Titel und Veranstaltungsname kommen aus dem Browser, werden also gekappt:
  // was von dort kommt, ist eine Behauptung, keine Tatsache.
  const titel = typeof title === "string" && title.trim() ? title.trim().slice(0, 300) : null;
  const veranstaltung =
    typeof event === "string" && event.trim() ? event.trim().slice(0, 200) : null;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const verlauf: Nachricht[] = [];
  for (const m of messages) {
    const rolle = (m as Nachricht)?.role;
    const text = (m as Nachricht)?.content;
    if (rolle !== "user" && rolle !== "assistant") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    // Nur die Eingaben des Menschen werden auf Länge geprüft; was das Modell
    // vorher gesagt hat, kommt aus derselben Quelle und ist ohnehin begrenzt.
    if (rolle === "user" && !eingabeOk(text)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    verlauf.push({ role: rolle, content: String(text) });
  }
  if (verlauf[verlauf.length - 1]?.role !== "user") {
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
  if (!key) return NextResponse.json({ answer: null, post: null, no_model: true });

  // 2 · Formulieren
  const { system, messages: gekuerzt } = anfrageBauen(
    verlauf,
    sprache,
    occasion,
    channel,
    titel,
    veranstaltung,
  );
  let roh: string | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODELL, max_tokens: MAX_TOKENS, system, messages: gekuerzt }),
      // Wie bei den anderen Assistenten: wer 30 Sekunden wartet, hat das
      // Vertrauen verloren, bevor die Antwort kommt.
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.error("[speaker/post] Anthropic:", res.status, await res.text().catch(() => ""));
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
    console.error("[speaker/post] Anthropic:", fehler);
  }

  if (!roh) return NextResponse.json({ answer: null, post: null, failed: true });

  return NextResponse.json({ answer: antwortOhneBlock(roh), post: postLesen(roh) });
}
