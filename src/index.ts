
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyCreemWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  webhookSecret: string
): boolean {
  if (!signature || !webhookSecret) {
    return false;
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    providedBuffer.length === 0
  ) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export interface CreemPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail?: string;
  visitorId?: string;
}

export interface BridgeOptions {
  datafastApiKey: string;
  endpoint?: string;
}

export function createCreemDataFastBridge(
  options: BridgeOptions
) {
  if (!options.datafastApiKey) {
    throw new Error("DataFast API key is required");
  }

  const endpoint =
    options.endpoint ??
    "https://datafa.st/api/v1/payments";

  return {
    async trackPayment(
      payment: CreemPayment
    ): Promise<void> {
      if (payment.status !== "paid") {
        return;
      }

      if (!payment.id || !payment.currency) {
        throw new Error("Payment ID and currency are required");
      }

      if (
        !Number.isFinite(payment.amount) ||
        payment.amount <= 0
      ) {
        throw new Error("Amount must be positive");
      }

      const body = {
        amount: payment.amount,
        currency: payment.currency,
        transaction_id: payment.id,
        email: payment.customerEmail,
        datafast_visitor_id: payment.visitorId,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.datafastApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          `DataFast API error (${response.status}): ${message}`
        );
      }
    },
  };
}
