import { createHash } from "node:crypto";
import type { SanityMutation } from "@/lib/sanity/client";

/**
 * Speaker für die Website (SPK-046) — reine Rechnung ohne Netz, damit `npm test` sie prüft.
 * Kontrakt: `docs/sanity-speaker-kontrakt.md` (v2, am 02.10.2026 gegen das Dataset geprüft).
 *
 * Die Form folgt dem Studio der Website: Namen als Text, Sprachfelder als `internationalizedArray*`
 * (`{ _key, _type, language, value }`), Bilder als `{ _type: "image", asset: { _ref } }`. So sieht
 * `portalSpeaker` im Studio aus wie die Dokumente des Web-Teams.
 *
 * Nur `import type` aus `client.ts`: das Modul liest die Umgebung, dieses nicht.
 */
export const SPEAKER_TYPE = "portalSpeaker";
export const SPEAKER_SESSION_TYPE = "portalSpeakerSession";
/** `external_ref.object_type`; `object_id` ist die Person. */
export const SPEAKER_REF_TYPE = "speaker";

/**
 * Eine Person, ein Dokument, über alle Jahrgänge (Entscheidungslog 24.09.). Bindestrich statt Punkt:
 * eine ID mit Punkt gilt in Sanity als Pfad und ist ohne Token nicht lesbar.
 */
export function speakerDocId(personId: string): string {
  return `speaker-${personId}`;
}

/** Eine Zeile aus `sanity_speakers()` — je Person und Edition. */
export type SpeakerZeile = {
  person_id: string;
  profile_id: string;
  edition_id: string;
  edition_slug: string;
  edition_start: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  organization: string | null;
  bio_short_de: string | null;
  bio_short_en: string | null;
  website: string | null;
  linkedin: string | null;
  photo_path: string | null;
  photo_asset_id: string | null;
  photo_mime: string | null;
  pipeline_status: string | null;
  has_release: boolean;
  has_photo_video: boolean;
  released: boolean;
  is_test: boolean;
  sessions: { id: string; title_de: string | null; title_en: string | null; stage: string | null }[] | null;
};

/** Warum jemand nicht auf die Website geht — die Vorschau nennt jeden Grund. */
export type Grund = "testdaten" | "kein_name" | "keine_freigabe_einwilligung" | "keine_foto_einwilligung" | "nicht_veroeffentlicht";

export type SpeakerPerson = {
  personId: string;
  name: string;
  /** Profil, aus dem Jobtitel, Organisation, Bio und Foto kommen: die jüngste freigegebene Edition. */
  quelle: SpeakerZeile;
  /** Editionen, in denen die Person freigegeben ist — aufsteigend (Kontrakt). */
  editionen: string[];
  sessions: { id: string; titleDe: string | null; titleEn: string | null; stage: string | null; editionSlug: string }[];
  /** Leer heisst: das Tor ist offen. */
  gruende: Grund[];
};

function neuesteZuerst(a: SpeakerZeile, b: SpeakerZeile): number {
  return (b.edition_start ?? "").localeCompare(a.edition_start ?? "") || b.edition_slug.localeCompare(a.edition_slug);
}

/** Zeilen je Person bündeln und das Tor auswerten (Einwilligungen gelten je Person, die Freigabe je Edition). */
export function personenAus(zeilen: SpeakerZeile[]): SpeakerPerson[] {
  const jePerson = new Map<string, SpeakerZeile[]>();
  for (const z of zeilen) jePerson.set(z.person_id, [...(jePerson.get(z.person_id) ?? []), z]);
  const personen: SpeakerPerson[] = [];
  for (const [personId, alle] of jePerson) {
    const sortiert = [...alle].sort(neuesteZuerst);
    const frei = sortiert.filter((z) => z.released);
    const quelle = frei[0] ?? sortiert[0];
    const vorname = quelle.first_name?.trim() ?? "";
    const nachname = quelle.last_name?.trim() ?? "";
    const gruende: Grund[] = [];
    if (alle.some((z) => z.is_test)) gruende.push("testdaten");
    if (!vorname || !nachname) gruende.push("kein_name");
    if (!quelle.has_release) gruende.push("keine_freigabe_einwilligung");
    if (!quelle.has_photo_video) gruende.push("keine_foto_einwilligung");
    if (frei.length === 0) gruende.push("nicht_veroeffentlicht");
    personen.push({
      personId,
      name: `${vorname} ${nachname}`.trim() || "—",
      quelle,
      editionen: [...new Set(frei.map((z) => z.edition_slug))].sort(),
      sessions: [...frei]
        .reverse()
        .flatMap((z) =>
          (z.sessions ?? []).map((s) => ({ id: s.id, titleDe: s.title_de, titleEn: s.title_en, stage: s.stage, editionSlug: z.edition_slug })),
        ),
      gruende,
    });
  }
  return personen.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

type Sprache = "de" | "en";
export type I18nWert = { _key: Sprache; _type: string; language: Sprache; value: string };

/** Ein Sprachfeld wie im Studio; `_key` ist die Sprache — so bleibt ein zweiter Lauf ohne Unterschied. */
export function i18n(typ: "internationalizedArrayStringValue" | "internationalizedArrayTextValue", werte: Partial<Record<Sprache, string | null>>): I18nWert[] | undefined {
  const liste = (["de", "en"] as const)
    .map((sprache) => ({ sprache, wert: werte[sprache]?.trim() ?? "" }))
    .filter((x) => x.wert)
    .map((x) => ({ _key: x.sprache, _type: typ, language: x.sprache, value: x.wert }));
  return liste.length ? liste : undefined;
}

export type SpeakerBild = { _type: "image"; asset: { _type: "reference"; _ref: string } };

/** Genau die Felder, die das Portal besitzt — alles andere am Dokument gehört dem Web-Team. */
export type SpeakerFelder = {
  personId: string;
  name: string;
  role?: I18nWert[];
  company?: string;
  bio?: I18nWert[];
  website?: string;
  linkedin?: string;
  photo?: SpeakerBild;
  sessions: { _key: string; _type: typeof SPEAKER_SESSION_TYPE; title: I18nWert[]; stage?: string; editionSlug: string }[];
  editions: string[];
};

/** Felder, die fehlen dürfen — fehlen sie, nimmt `unset` sie vom Dokument. */
export const OPTIONALE_FELDER = ["role", "company", "bio", "website", "linkedin", "photo"] as const;

const nurHttps = (url: string | null) => (url && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined);

export function speakerFelder(p: SpeakerPerson, bildAssetId: string | null): SpeakerFelder {
  const q = p.quelle;
  const rolle = q.job_title?.trim();
  const felder: SpeakerFelder = {
    personId: p.personId,
    name: p.name,
    // Ein Jobtitel je Profil: in beiden Sprachen derselbe Text, damit die Seite in DE und EN etwas zeigt.
    role: rolle ? i18n("internationalizedArrayStringValue", { de: rolle, en: rolle }) : undefined,
    company: q.organization?.trim() || undefined,
    bio: i18n("internationalizedArrayTextValue", { de: q.bio_short_de, en: q.bio_short_en }),
    website: nurHttps(q.website),
    linkedin: nurHttps(q.linkedin),
    photo: bildAssetId ? { _type: "image", asset: { _type: "reference", _ref: bildAssetId } } : undefined,
    sessions: p.sessions.map((s) => ({
      _key: s.id,
      _type: SPEAKER_SESSION_TYPE,
      title: i18n("internationalizedArrayStringValue", { de: s.titleDe, en: s.titleEn }) ?? [],
      stage: s.stage?.trim() || undefined,
      editionSlug: s.editionSlug,
    })),
    editions: p.editionen,
  };
  for (const k of Object.keys(felder) as (keyof SpeakerFelder)[]) if (felder[k] === undefined) delete felder[k];
  return felder;
}

const kurz = (wert: unknown) => createHash("sha256").update(JSON.stringify(wert ?? null)).digest("hex").slice(0, 12);

/**
 * Fingerabdruck je Feld und als Ganzes — ohne Namen, damit `external_ref.meta` keine Personendaten hält.
 * Das Foto zählt über die Portal-Fassung (`photo_asset_id`), nicht über die Sanity-ID: die kennt der
 * Trockenlauf noch nicht.
 */
export function speakerFassung(p: SpeakerPerson): { fassung: string; teile: Record<string, string> } {
  const f = speakerFelder(p, null);
  const teile: Record<string, string> = {
    name: kurz(f.name),
    role: kurz(f.role),
    company: kurz(f.company),
    bio: kurz(f.bio),
    website: kurz(f.website),
    linkedin: kurz(f.linkedin),
    photo: kurz(p.quelle.photo_asset_id),
    sessions: kurz(f.sessions),
    editions: kurz(f.editions),
  };
  return { fassung: createHash("sha256").update(JSON.stringify(teile)).digest("hex"), teile };
}

/**
 * Anlegen nur, wenn es das Dokument nicht gibt — mit `visible: true`, danach gehört der Schalter dem
 * Web-Team. Dann `patch` mit genau unseren Feldern; fehlende optionale Felder werden entfernt.
 * Nie `createOrReplace`: das würde löschen, was das Web-Team am Dokument gesetzt hat.
 */
export function speakerMutationen(docId: string, felder: SpeakerFelder, jetzt: string): SanityMutation[] {
  const unset = OPTIONALE_FELDER.filter((k) => felder[k] === undefined);
  return [
    { createIfNotExists: { _id: docId, _type: SPEAKER_TYPE, visible: true } },
    { patch: { id: docId, set: { ...felder, portalUpdatedAt: jetzt }, ...(unset.length ? { unset } : {}) } },
  ];
}

/** Was `external_ref.meta` je Person hält — nur Fingerabdrücke und Kennungen. */
export type SpeakerRefMeta = {
  fassung?: string;
  teile?: Record<string, string>;
  photo_asset_id?: string | null;
  sanity_asset_id?: string | null;
  editions?: string[];
  published_at?: string;
};
export type SpeakerRef = { object_id: string; external_id: string; meta: SpeakerRefMeta | null };

export type PlanEintrag = {
  person: SpeakerPerson;
  art: "anlegen" | "aendern";
  fassung: string;
  teile: Record<string, string>;
  /** Geänderte Felder (nur bei `aendern`). */
  geaendert: string[];
  /** Das Foto muss neu hochgeladen werden (neue Fassung im Portal oder noch keins in Sanity). */
  fotoNeu: boolean;
  ref?: SpeakerRef;
};

export type SpeakerPlan = {
  uebertragen: PlanEintrag[];
  unveraendert: SpeakerPerson[];
  /** Dokumente, die weg müssen: Tor zu (Widerruf, Absage, Entzug) oder Person nicht mehr da. */
  entfernen: { personId: string; docId: string; sanityAssetId: string | null; name: string | null; gruende: Grund[] }[];
  zurueckgehalten: SpeakerPerson[];
};

export function speakerPlan(personen: SpeakerPerson[], refs: SpeakerRef[]): SpeakerPlan {
  const refVon = new Map(refs.map((r) => [r.object_id, r]));
  const plan: SpeakerPlan = { uebertragen: [], unveraendert: [], entfernen: [], zurueckgehalten: [] };
  const offen = new Set<string>();
  for (const p of personen) {
    if (p.gruende.length > 0) {
      plan.zurueckgehalten.push(p);
      continue;
    }
    offen.add(p.personId);
    const ref = refVon.get(p.personId);
    const { fassung, teile } = speakerFassung(p);
    const fotoNeu = Boolean(p.quelle.photo_asset_id) && (ref?.meta?.photo_asset_id !== p.quelle.photo_asset_id || !ref?.meta?.sanity_asset_id);
    if (!ref) {
      plan.uebertragen.push({ person: p, art: "anlegen", fassung, teile, geaendert: [], fotoNeu, ref });
    } else if (ref.meta?.fassung !== fassung) {
      const vorher = ref.meta?.teile ?? {};
      const geaendert = Object.keys(teile).filter((k) => vorher[k] !== teile[k]);
      plan.uebertragen.push({ person: p, art: "aendern", fassung, teile, geaendert, fotoNeu, ref });
    } else {
      plan.unveraendert.push(p);
    }
  }
  const zurueck = new Map(plan.zurueckgehalten.map((p) => [p.personId, p]));
  for (const r of refs) {
    if (offen.has(r.object_id)) continue;
    const p = zurueck.get(r.object_id);
    plan.entfernen.push({
      personId: r.object_id,
      docId: r.external_id,
      sanityAssetId: r.meta?.sanity_asset_id ?? null,
      name: p?.name ?? null,
      gruende: p?.gruende ?? [],
    });
  }
  return plan;
}
