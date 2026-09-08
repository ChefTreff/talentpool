"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/areas";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export type LoginLabels = {
  title: string;
  lead: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  sending: string;
  sentTitle: string;
  sentBody: string;
  required: string;
};

/** Magic-Link-Login. Nach dem Klick landet man auf `/auth/callback?next=…`. */
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

  if (status === "sent") {
    return (
      <Card>
        <h1 className="ct-h2 text-ink">{labels.sentTitle}</h1>
        <p className="mt-2 text-muted">
          {labels.sentBody} <strong className="text-ink">{email}</strong>.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="ct-h1 text-ink">{labels.title}</h1>
      <p className="mt-2 text-muted">{labels.lead}</p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
  );
}
