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

export async function sendExpenseToIntegrations(input: {
  invoiceNo: string;
  speakerName: string;
  amountCents: number;
  bytes: Uint8Array;
}): Promise<IntegrationResult> {
  return {
    ...(await toSevdesk(input)),
    qonto: await toQontoInbox(input),
  };
}

async function toSevdesk(input: {
  invoiceNo: string;
  speakerName: string;
  amountCents: number;
}): Promise<{ sevdesk: IntegrationOutcome; sevdeskRef: string | null }> {
  const token = process.env.SEVDESK_API_TOKEN?.trim();
  if (!token) {
    console.info(
      `[expenses] SevDesk übersprungen (kein SEVDESK_API_TOKEN): ${input.invoiceNo}, ` +
        `${(input.amountCents / 100).toFixed(2)} EUR, ${input.speakerName}`,
    );
    return { sevdesk: "dry-run", sevdeskRef: null };
  }
  try {
    // Feldzuordnung nach dem make.com-Szenario des Team-Portals.
    const res = await fetch("https://my.sevdesk.de/api/v1/Voucher/Factory/saveVoucher", {
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

async function toQontoInbox(input: {
  invoiceNo: string;
  speakerName: string;
  amountCents: number;
  bytes: Uint8Array;
}): Promise<IntegrationOutcome> {
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
