import "server-only";

/**
 * SevDesk-Beleg und Mail ans Qonto-Postfach.
 *
 * Ohne Zugangsdaten passiert nichts — die Freigabe soll daran nicht scheitern.
 * Der Rückgabewert sagt je Kanal, was war: `sent`, `dry-run` (kein Token
 * hinterlegt) oder `failed` mit Grund im Log. Dieselbe Haltung wie im
 * Mail-Worker, der ohne `RESEND_API_KEY` in der Entwicklung nur protokolliert.
 */

export type IntegrationOutcome = "sent" | "dry-run" | "failed";

export type IntegrationResult = {
  sevdesk: IntegrationOutcome;
  sevdeskRef: string | null;
  qonto: IntegrationOutcome;
};

type ExpenseInput = {
  invoiceNo: string;
  speakerName: string;
  amountCents: number;
  bytes: Uint8Array;
};

const SEVDESK = "https://my.sevdesk.de/api/v1";

export async function sendExpenseToIntegrations(
  input: ExpenseInput,
): Promise<IntegrationResult> {
  return {
    ...(await toSevdesk(input)),
    qonto: await toQontoInbox(input),
  };
}

/**
 * Beleg-Datei zuerst: SevDesk nimmt das Dokument über `uploadTempFile` an und
 * gibt einen Dateinamen zurück, den `saveVoucher` dann als `filename`
 * übernimmt. Ohne diesen Schritt hinge der Beleg ohne Dokument in der
 * Buchhaltung. Scheitert nur der Upload, geht der Beleg trotzdem raus — lieber
 * ein Voucher ohne Anhang als gar keiner; die Zeile steht im Log.
 */
async function uploadTempFile(
  token: string,
  input: ExpenseInput,
): Promise<string | null> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.bytes)], { type: "application/pdf" }),
    `${input.invoiceNo}.pdf`,
  );
  const res = await fetch(`${SEVDESK}/Voucher/Factory/uploadTempFile`, {
    method: "POST",
    headers: { authorization: token },
    body: form,
  });
  if (!res.ok) {
    console.error(`[expenses] SevDesk uploadTempFile ${res.status} für ${input.invoiceNo}`);
    return null;
  }
  const body = (await res.json()) as { objects?: { filename?: string } | string };
  const filename =
    typeof body.objects === "string" ? body.objects : body.objects?.filename;
  if (!filename) {
    console.error(`[expenses] SevDesk uploadTempFile ohne filename für ${input.invoiceNo}`);
    return null;
  }
  return filename;
}

async function toSevdesk(
  input: ExpenseInput,
): Promise<{ sevdesk: IntegrationOutcome; sevdeskRef: string | null }> {
  const token = process.env.SEVDESK_API_TOKEN?.trim();
  if (!token) {
    console.info(
      `[expenses] SevDesk übersprungen (kein SEVDESK_API_TOKEN): ${input.invoiceNo}, ` +
        `${(input.amountCents / 100).toFixed(2)} EUR, ${input.speakerName}`,
    );
    return { sevdesk: "dry-run", sevdeskRef: null };
  }
  try {
    const filename = await uploadTempFile(token, input);
    // Feldzuordnung nach dem make.com-Szenario des Team-Portals.
    const res = await fetch(`${SEVDESK}/Voucher/Factory/saveVoucher`, {
      method: "POST",
      headers: { authorization: token, "content-type": "application/json" },
      body: JSON.stringify({
        voucher: {
          objectName: "Voucher",
          mapAll: true,
          voucherType: "VOU",
          creditDebit: "C",
          description: `${input.invoiceNo} · ${input.speakerName}`,
          voucherDate: new Date().toISOString().slice(0, 10),
          ...(filename ? { filename } : {}),
        },
        voucherPosSave: [
          {
            objectName: "VoucherPos",
            mapAll: true,
            sumNet: input.amountCents / 100,
            sumGross: input.amountCents / 100,
            taxRate: 0,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[expenses] SevDesk ${res.status} für ${input.invoiceNo}`);
      return { sevdesk: "failed", sevdeskRef: null };
    }
    const body = (await res.json()) as { objects?: { voucher?: { id?: string } } };
    return { sevdesk: "sent", sevdeskRef: body.objects?.voucher?.id ?? null };
  } catch (error) {
    console.error("[expenses] SevDesk:", (error as Error).message);
    return { sevdesk: "failed", sevdeskRef: null };
  }
}

async function toQontoInbox(input: ExpenseInput): Promise<IntegrationOutcome> {
  const to = process.env.QONTO_INBOX_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!to || !apiKey) {
    console.info(
      `[expenses] Qonto-Mail übersprungen (${!to ? "kein QONTO_INBOX_EMAIL" : "kein RESEND_API_KEY"}): ` +
        `${input.invoiceNo}`,
    );
    return "dry-run";
  }
  try {
    const { sendViaResend } = await import("@/lib/mail/client");
    const { senderAddress } = await import("@/lib/mail/send");
    const amount = `${(input.amountCents / 100).toFixed(2)} EUR`;
    const res = await sendViaResend({
      from: senderAddress(),
      to,
      subject: `Auslagenrechnung ${input.invoiceNo} · ${input.speakerName}`,
      html: `<p>Auslagenrechnung ${input.invoiceNo}</p><p>${input.speakerName} · ${amount}</p>`,
      text: `Auslagenrechnung ${input.invoiceNo}\n${input.speakerName} · ${amount}`,
      // Derselbe Antrag darf zweimal freigegeben werden, ohne zweimal im
      // Postfach zu landen.
      idempotencyKey: `qonto-${input.invoiceNo}`,
      attachments: [
        {
          filename: `${input.invoiceNo}.pdf`,
          content: Buffer.from(input.bytes).toString("base64"),
        },
      ],
    });
    if (!res.ok) {
      console.error("[expenses] Qonto-Mail:", res.error);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("[expenses] Qonto-Mail:", (error as Error).message);
    return "failed";
  }
}
