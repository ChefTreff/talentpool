"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/areas";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export type LoginLabels = {
  eyebrow: string;
  titleLead: string;
  titleHighlight: string;
  lead: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  sending: string;
  sentTitle: string;
  sentBody: string;
  required: string;
  helpTitle: string;
  helpBody: string;
  helpMailbox: string;
};

/**
 * Magic-Link-Login. Nach dem Klick landet man auf `/auth/callback?next=…`.
 *
 * Einer der drei Marken-Momente (Login, Welcome, Hero-Band): Navy-Grund,
 * Formen dahinter, **ein** Highlight-Wort in ExtraBold Italic im
 * Highlight-Pink. Die Anrede steht dabei ausserhalb der Karte und die Karte
 * trägt nur noch das Feld — vorher stand der Titel in der weissen Karte, und
 * damit war der Marken-Moment eine Überschrift auf Papier statt ein Empfang.
 *
 * Genau eine Aktion, kein zweiter Weg hinein. Was tun, wenn die Mail nicht
 * ankommt, steht darunter — als Text, nicht als zweiter Knopf.
 */
export function LoginForm({
  next,
  authError,
  labels,
}: {
  next?: string;
  authError?: string;
  labels: LoginLabels;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const callback = new URL("/auth/callback", window.location.origin);
    // Doppelt geprüft: hier und im Callback. Ein fremdes Ziel darf gar nicht
    // erst in den Magic-Link wandern.
    const target = safeNextPath(next, "");
    if (target) callback.searchParams.set("next", target);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback.toString() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <>
      <div className="mb-8">
        <p className="ct-eyebrow text-on-navy-muted">{labels.eyebrow}</p>
        <h1 className="ct-display mt-3 text-on-navy">
          {labels.titleLead}{" "}
          {/* Der Akzent trägt auf Navy keinen Text (3,56:1) — das
              Highlight-Wort steht im Highlight-Pink (8,0:1). */}
          <em className="ct-highlight text-highlight">{labels.titleHighlight}</em>
        </h1>
        <p className="ct-laica mt-4 max-w-[46ch] text-on-navy-muted">{labels.lead}</p>
      </div>

      {status === "sent" ? (
        <Card>
          <h2 className="ct-h2 text-ink">{labels.sentTitle}</h2>
          <p className="mt-2 text-muted">
            {labels.sentBody} <strong className="text-ink">{email}</strong>.
          </p>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field
              label={labels.emailLabel}
              htmlFor="email"
              required
              requiredLabel={labels.required}
              error={status === "error" ? message : authError}
            >
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder={labels.emailPlaceholder}
                invalid={status === "error"}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" loading={status === "sending"} className="self-start">
              {status === "sending" ? labels.sending : labels.submit}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-8">
        <p className="ct-label text-on-navy">{labels.helpTitle}</p>
        <p className="ct-small mt-1 max-w-[52ch] text-on-navy-muted">
          {labels.helpBody}{" "}
          <a
            href={`mailto:${labels.helpMailbox}`}
            className="text-on-navy underline underline-offset-2"
          >
            {labels.helpMailbox}
          </a>
        </p>
      </div>
    </>
  );
}
