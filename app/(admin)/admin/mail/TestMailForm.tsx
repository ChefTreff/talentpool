"use client";

import { useState, useTransition } from "react";
import { sendTestMail, type TestMailResult } from "./actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

export function TestMailForm({
  defaultTo,
  labels,
}: {
  defaultTo: string;
  labels: {
    recipient: string;
    send: string;
    sending: string;
    sent: string;
    suppressed: string;
    failed: string;
    dryRunHint: string;
    required: string;
    messages: Record<string, string>;
  };
}) {
  const [to, setTo] = useState(defaultTo);
  const [result, setResult] = useState<TestMailResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        start(async () => setResult(await sendTestMail(to)));
      }}
    >
      <Field
        label={labels.recipient}
        htmlFor="mail-to"
        required
        requiredLabel={labels.required}
        className="min-w-[280px] flex-1"
      >
        <Input
          id="mail-to"
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={pending} className="mb-0.5">
        {pending ? labels.sending : labels.send}
      </Button>

      {result && (
        <div className="basis-full">
          {result.status === "suppressed" ? (
            <Badge tone="warning">{labels.suppressed}</Badge>
          ) : result.status === "failed" ? (
            <Badge tone="error">
              {result.message
                ? (labels.messages[result.message] ?? labels.failed)
                : `${labels.failed}${result.error ? `: ${result.error}` : ""}`}
            </Badge>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">
                {labels.sent}
                {result.providerId ? ` · ${result.providerId}` : ""}
              </Badge>
              {result.dryRun && <span className="ct-help">{labels.dryRunHint}</span>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
