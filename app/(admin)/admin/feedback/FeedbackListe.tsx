"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { updateFeedback } from "./actions";

type Strings = Record<string, string>;

export type FeedbackZeile = {
  id: string;
  format: string;
  kind: string | null;
  ratings: Record<string, number>;
  return_intent: string | null;
  main_reason: string | null;
  memorable: string | null;
  body: string | null;
  created_on: string;
  status: "open" | "seen" | "done";
  tags: string[];
  anonymous: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

/**
 * Feedback sichten (TAL-011): Filter nach Format und Status, je Eintrag Status
 * und Schlagworte (die Ordnung nach Themen macht das Team; KI-Clustering
 * später, K-43). Bei Klarnamen steht die Adresse für eine Antwort da — bei
 * anonymem Feedback gibt es nichts, was auf die Person zeigt.
 */
export function FeedbackListe({ rows, labels, t }: { rows: FeedbackZeile[]; labels: { formats: Record<string, string>; kinds: Record<string, string>; reasons: Record<string, string> }; t: Strings }) {
  const [format, setFormat] = useState("");
  const [status, setStatus] = useState("open");
  const gezeigt = rows.filter((r) => (!format || r.format === format) && (!status || r.status === status));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={t.filterFormat} className="w-auto" value={format} placeholder={t.allFormats}
          options={Object.entries(labels.formats).map(([value, label]) => ({ value, label: `${label} (${rows.filter((r) => r.format === value).length})` }))}
          onChange={(e) => setFormat(e.target.value)} />
        <Select aria-label={t.filterStatus} className="w-auto" value={status} placeholder={t.allStatus}
          options={["open", "seen", "done"].map((s) => ({ value: s, label: t[`status_${s}`] }))}
          onChange={(e) => setStatus(e.target.value)} />
      </div>
      {gezeigt.length === 0 ? (
        <p className="ct-help">{t.none}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {gezeigt.map((r) => <Eintrag key={r.id} r={r} labels={labels} t={t} />)}
        </ul>
      )}
    </div>
  );
}

function Eintrag({ r, labels, t }: { r: FeedbackZeile; labels: { formats: Record<string, string>; kinds: Record<string, string>; reasons: Record<string, string> }; t: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tags, setTags] = useState(r.tags.join(", "));
  const speichern = (status: "open" | "seen" | "done") =>
    start(async () => {
      const res = await updateFeedback(r.id, status, tags.split(",").map((x) => x.trim()).filter(Boolean));
      if (!res.ok) toast("error", t.failed);
      else { toast("success", t.saved); router.refresh(); }
    });
  const bewertungen = Object.entries(r.ratings ?? {});
  return (
    <li className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{labels.formats[r.format] ?? r.format}</Badge>
        {r.kind && <Badge tone="neutral">{labels.kinds[r.kind] ?? r.kind}</Badge>}
        <Badge tone={r.status === "open" ? "warning" : r.status === "done" ? "success" : "neutral"}>{t[`status_${r.status}`]}</Badge>
        <span className="ct-help">{r.created_on}</span>
        <span className="ct-help">
          {r.anonymous ? t.anonymous : [r.first_name, r.last_name].filter(Boolean).join(" ")}
          {!r.anonymous && r.email && <> · <a className="ct-link" href={`mailto:${r.email}`}>{t.reply}</a></>}
        </span>
      </div>
      {bewertungen.length > 0 && (
        <p className="ct-small tabular-nums">{bewertungen.map(([k, v]) => `${t[`q_${k}`] ?? k}: ${v}`).join(" · ")}</p>
      )}
      {(r.return_intent || r.main_reason) && (
        <p className="ct-help">
          {[r.return_intent ? `${t.returnIntent}: ${t[`intent_${r.return_intent}`]}` : null, r.main_reason ? `${t.mainReason}: ${labels.reasons[r.main_reason] ?? r.main_reason}` : null].filter(Boolean).join(" · ")}
        </p>
      )}
      {r.memorable && <p className="ct-small whitespace-pre-line"><span className="ct-label">{t.memorable}: </span>{r.memorable}</p>}
      {r.body && <p className="whitespace-pre-line leading-6">{r.body}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={t.tags} placeholder={t.tags} className="w-64" value={tags} disabled={pending} onChange={(e) => setTags(e.target.value)} />
        {r.status !== "seen" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => speichern("seen")}>{t.markSeen}</Button>}
        {r.status !== "done" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => speichern("done")}>{t.markDone}</Button>}
        {r.status !== "open" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => speichern("open")}>{t.markOpen}</Button>}
      </div>
    </li>
  );
}
