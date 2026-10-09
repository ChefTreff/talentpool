"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { useUrlFilter } from "@/components/ui/useUrlFilter";
import { gruppiereBegriffe } from "@/lib/vokabular/suche";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { removeTerm, saveTerm } from "./actions";
import type { VocabTerm } from "./types";

type Strings = Record<string, string>;

const leer = (vocabulary: string): VocabTerm => ({
  vocabulary,
  key: "",
  label_de: "",
  label_en: "",
  sort_order: 0,
  active: true,
  parent_vocabulary: null,
  parent_key: null,
  usage: 0,
  kinder: 0,
});

/**
 * Vokabularpflege.
 *
 * Drei Dinge stehen bewusst in der Zeile und nicht in einem Dialog: der
 * Schalter aktiv/inaktiv, die Reihenfolge und die Verwendungszahl. Das sind die
 * Angaben, wegen derer man die Seite öffnet.
 *
 * **Der Löschknopf kennt drei Zustände, nicht zwei.** Frei löschbar, in
 * Gebrauch, und — der wichtigste — „wir wissen nicht, wo dieser Begriff benutzt
 * wird". Der dritte Fall sieht aus wie der erste und ist wie der zweite zu
 * behandeln; deshalb steht er als eigener Hinweis da und nicht als
 * ausgegrauter Knopf ohne Erklärung.
 */
export function VokabularView({
  terms,
  t,
  common,
  rpcMessages,
}: {
  terms: VocabTerm[];
  t: Strings;
  common: { save: string; cancel: string; delete: string; active: string; inactive: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState<VocabTerm | null>(null);
  // Fehler aus dem Schubfach gehoeren **in** das Schubfach: ein Toast liegt
  // im Top-Layer zwar jetzt richtig, aber ein Formularfehler gehoert an das
  // Formular, nicht an den unteren Bildschirmrand (Skill, Verbotsliste).
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [frage, setFrage] = useState<VocabTerm | null>(null);
  // Suche und Vokabular stehen in der Adresszeile (`?q=`, `?vokabular=`): ein Fund lässt sich weiterschicken.
  const [f, setF] = useUrlFilter({ q: "", vokabular: "" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  const { namen, gruppen, treffer } = useMemo(() => gruppiereBegriffe(terms, f), [terms, f]);
  const alleNamen = useMemo(() => [...new Set(terms.map((x) => x.vocabulary))].sort(), [terms]);

  function speichern(term: VocabTerm) {
    start(async () => {
      const res = await saveTerm({
        vocabulary: term.vocabulary,
        key: term.key,
        label_de: term.label_de,
        label_en: term.label_en,
        sort_order: Number(term.sort_order) || 0,
        active: term.active,
        parent_vocabulary: term.parent_vocabulary,
        parent_key: term.parent_key,
      });
      if (!res.ok) {
        setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setFehler(null);
      setOffen(null);
      setNeu(false);
      router.refresh();
    });
  }

  function loeschen(term: VocabTerm) {
    start(async () => {
      const res = await removeTerm(term.vocabulary, term.key);
      setFrage(null);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.deleted);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-80">
          <Field label={t.searchLabel} htmlFor="f-q">
            <SuchFeld id="f-q" value={f.q} placeholder={t.searchPlaceholder} onChange={(e) => setF({ q: e.target.value })} />
          </Field>
        </div>
        <div className="w-full sm:w-70">
          <Field label={t.filterVocabulary} htmlFor="f-voc">
            <Select
              id="f-voc"
              placeholder={t.allVocabularies}
              options={alleNamen.map((v) => ({ value: v, label: v }))}
              value={f.vokabular}
              onChange={(e) => setF({ vokabular: e.target.value })}
            />
          </Field>
        </div>
        {f.vokabular && (
          <Button
            size="sm"
            onClick={() => {
              setOffen(leer(f.vokabular));
              setNeu(true);
            }}
          >
            {t.addTerm}
          </Button>
        )}
      </div>
      <p className="ct-label mb-4 text-ink">{t.hits.replace("{n}", String(treffer)).replace("{m}", String(terms.length))}</p>
      {namen.length === 0 && <p className="ct-small text-muted">{t.noHits}</p>}

      <div className="flex flex-col gap-8">
        {namen.map((v) => (
          <section key={v}>
            <h2 className="ct-h2 mb-2 text-ink">
              {v}{" "}
              <span className="font-semibold normal-case tracking-normal text-muted">
                ({gruppen[v].length})
              </span>
            </h2>
            <Table>
              <Thead>
                <Th>{t.colKey}</Th>
                <Th>{t.colDe}</Th>
                <Th>{t.colEn}</Th>
                <Th numeric>{t.colSort}</Th>
                <Th>{t.colUsage}</Th>
                <Th>{t.colStatus}</Th>
                <Th>{t.colActions}</Th>
              </Thead>
              <Tbody>
                {gruppen[v].map((term) => (
                  <Tr key={term.key} controls>
                    <Td className="whitespace-nowrap font-mono ct-help text-muted">{term.key}</Td>
                    <Td><span className="block max-w-64 truncate" title={term.label_de}>{term.label_de}</span></Td>
                    <Td className="text-muted"><span className="block max-w-64 truncate" title={term.label_en}>{term.label_en}</span></Td>
                    <Td numeric className="text-muted">{term.sort_order}</Td>
                    <Td className="whitespace-nowrap ct-help text-muted">
                      {term.usage === null
                        ? t.usageUnknown
                        : term.usage === 0
                          ? t.usageNone
                          : t.usageCount.replace("{n}", String(term.usage))}
                      {term.kinder > 0 && ` · ${t.children.replace("{n}", String(term.kinder))}`}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Badge tone={term.active ? "success" : "neutral"}>
                        {term.active ? common.active : common.inactive}
                      </Badge>
                    </Td>
                    {/* Eine Zeile je Begriff (ADM-101): „Bearbeiten“ bleibt ein Knopf, alles Weitere liegt im Menü. */}
                    <Td className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            setOffen({ ...term });
                            setNeu(false);
                          }}
                        >
                          {t.edit}
                        </Button>
                        <Menu ton="hell" label={t.moreActions} trigger={<span>{t.moreActions}</span>} align="end">
                          <MenuItem onSelect={() => speichern({ ...term, active: !term.active })}>
                            {term.active ? t.deactivate : t.activate}
                          </MenuItem>
                          {/* Der Eintrag erscheint nur, wenn beides stimmt: niemand benutzt den Begriff, und die Datenbank weiss das
                              auch. Bei `usage === null` fehlt er, und daneben steht warum. */}
                          {term.usage === 0 && term.kinder === 0 && (
                            <MenuItem onSelect={() => setFrage(term)}>{common.delete}</MenuItem>
                          )}
                        </Menu>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </section>
        ))}
      </div>

      <Drawer
        open={offen !== null}
        error={fehler}
        onClose={() => {
          setFehler(null);
          setOffen(null);
          setNeu(false);
        }}
        title={neu ? t.addTerm : t.editTerm}
        footer={
          offen && (
            <div className="flex gap-2">
              <Button onClick={() => speichern(offen)} disabled={pending}>
                {common.save}
              </Button>
              <Button variant="ghost" onClick={() => setOffen(null)}>
                {common.cancel}
              </Button>
            </div>
          )
        }
      >
        {offen && (
          <div className="flex flex-col gap-4">
            <Field label={t.fieldVocabulary} htmlFor="v-voc" hint={t.fieldVocabularyHint}>
              <Input id="v-voc" value={offen.vocabulary} disabled />
            </Field>
            <Field label={t.fieldKey} htmlFor="v-key" hint={neu ? t.fieldKeyHint : t.fieldKeyFixed} required>
              <Input
                id="v-key"
                value={offen.key}
                disabled={!neu}
                required
                onChange={(e) => setOffen({ ...offen, key: e.target.value })}
              />
            </Field>
            <Field label={t.fieldDe} htmlFor="v-de" required>
              <Input id="v-de" value={offen.label_de} required
                onChange={(e) => setOffen({ ...offen, label_de: e.target.value })} />
            </Field>
            <Field label={t.fieldEn} htmlFor="v-en" hint={t.fieldEnHint} required>
              <Input id="v-en" value={offen.label_en} required
                onChange={(e) => setOffen({ ...offen, label_en: e.target.value })} />
            </Field>
            <Field label={t.fieldSort} htmlFor="v-sort" hint={t.fieldSortHint}>
              <Input id="v-sort" type="number" value={offen.sort_order}
                onChange={(e) => setOffen({ ...offen, sort_order: Number(e.target.value) || 0 })} />
            </Field>
            <label className="flex items-center gap-2 ct-label">
              <input type="checkbox" checked={offen.active}
                onChange={(e) => setOffen({ ...offen, active: e.target.checked })} />
              {common.active}
            </label>
          </div>
        )}
      </Drawer>

      {frage && (
        <ConfirmDialog
          title={t.confirmDeleteTitle}
          body={t.confirmDeleteBody.replace("{key}", frage.key)}
          confirmLabel={common.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => loeschen(frage)}
          onCancel={() => setFrage(null)}
        />
      )}
    </>
  );
}
