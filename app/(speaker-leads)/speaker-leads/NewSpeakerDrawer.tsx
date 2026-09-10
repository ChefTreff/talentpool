"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { createSpeaker, findPeople, type FoundPerson } from "./actions";
import type { ManagerScope } from "./types";

type Strings = Record<string, string>;

/**
 * Speaker anlegen. Die RPC erkennt eine bestehende Person an der E-Mail und
 * verknüpft sie, statt eine zweite anzulegen; die Suche hier ist die
 * Abkürzung, wenn man den Namen kennt, aber die Adresse nicht.
 */
export function NewSpeakerDrawer({
  editions,
  speakerTypes,
  canSearchPeople,
  t,
  common,
  rpcMessages,
  onClose,
}: {
  editions: ManagerScope["editions"];
  speakerTypes: Record<string, string>;
  /**
   * `search_people` prüft `is_staff()` — einem reinen Manager antwortet sie
   * mit 42501. Statt eines Feldes, das nie etwas findet, zeigen wir ihm den
   * Hinweis: die E-Mail verknüpft eine bestehende Person ohnehin.
   */
  canSearchPeople: boolean;
  t: Strings;
  common: {
    cancel: string;
    choose: string;
    close: string;
    none: string;
    required: string;
    save: string;
  };
  rpcMessages: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [editionId, setEditionId] = useState(editions[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [type, setType] = useState("keynote");
  const [job, setJob] = useState("");
  const [org, setOrg] = useState("");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FoundPerson[]>([]);
  const [linked, setLinked] = useState<FoundPerson | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  useEffect(() => {
    const handle = setTimeout(() => {
      const term = query.trim();
      if (term.length < 2) {
        setHits([]);
        return;
      }
      findPeople(term).then(setHits);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function onCreate() {
    startTransition(async () => {
      const res = await createSpeaker({
        editionId,
        email,
        firstName: first,
        lastName: last,
        speakerType: type,
        jobTitle: job,
        organizationName: org,
        personId: linked?.id ?? null,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.speakerCreated);
      router.refresh();
      onClose();
    });
  }

  const canCreate =
    editionId !== "" && (linked !== null || (email.trim() !== "" && first.trim() !== ""));

  return (
    <Drawer open onClose={onClose} closeLabel={common.close} title={t.newSpeaker}>
      <div className="flex flex-col gap-4">
        {editions.length > 1 ? (
          <Field label={t.fieldEdition} htmlFor="edition">
            <Select
              id="edition"
              value={editionId}
              placeholder={common.choose}
              options={editions.map((e) => ({ value: e.id, label: e.name ?? e.slug ?? e.id }))}
              onChange={(e) => setEditionId(e.target.value)}
            />
          </Field>
        ) : (
          editions[0] && (
            <p className="ct-help">
              {t.fieldEdition}: {editions[0].name ?? editions[0].slug}
            </p>
          )
        )}

        {canSearchPeople ? (
        <section className="rounded-ct-md border p-3">
          <Field label={t.linkPerson} htmlFor="person-search" hint={t.linkPersonHint}>
            <Input
              id="person-search"
              value={linked ? "" : query}
              disabled={linked !== null}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </Field>
          {linked ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="ct-label">{linked.display_name ?? linked.email}</span>
              <Button size="sm" variant="ghost" onClick={() => setLinked(null)}>
                {t.linkRemove}
              </Button>
            </div>
          ) : (
            hits.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setLinked(h);
                        setHits([]);
                        setQuery("");
                        if (h.email) setEmail(h.email);
                      }}
                      className="w-full rounded-ct-sm px-2 py-1 text-left text-[14px] hover:bg-surface-hover"
                    >
                      <span className="font-semibold">{h.display_name ?? "—"}</span>
                      {h.email && <span className="ct-help"> · {h.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
        ) : (
          <p className="ct-help">{t.linkByEmailOnly}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.fieldFirstName}
            htmlFor="new-first"
            required
            requiredLabel={common.required}
          >
            <Input id="new-first" value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label={t.fieldLastName} htmlFor="new-last">
            <Input id="new-last" value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
          <Field
            label={t.fieldEmail}
            htmlFor="new-email"
            hint={t.fieldEmailHint}
            required
            requiredLabel={common.required}
          >
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t.fieldType} htmlFor="new-type">
            <Select
              id="new-type"
              value={type}
              options={Object.entries(speakerTypes).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(e) => setType(e.target.value)}
            />
          </Field>
          <Field label={t.fieldJobTitle} htmlFor="new-job">
            <Input id="new-job" value={job} onChange={(e) => setJob(e.target.value)} />
          </Field>
          <Field label={t.fieldOrganization} htmlFor="new-org">
            <Input id="new-org" value={org} onChange={(e) => setOrg(e.target.value)} />
          </Field>
        </div>

        <p className="ct-help">{t.newSpeakerHint}</p>

        <div className="flex gap-2">
          <Button onClick={onCreate} loading={pending} disabled={!canCreate}>
            {t.createSpeaker}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {common.cancel}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
