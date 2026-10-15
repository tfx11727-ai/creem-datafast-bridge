
import { createHmac, timingSafeEqual } from "node:crypto";

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

export function verifyCreemWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  webhookSecret: string
): boolean {
  if (!signature || !webhookSecret) return false;

  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const provided = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (
    provided.length !== expectedBuffer.length ||
    provided.length === 0
  ) {
    return false;
  }

  return timingSafeEqual(provided, expectedBuffer);
}

export function createCreemDataFastBridge(
  options: BridgeOptions
) {
  if (!options.datafastApiKey) {
    throw new Error("DataFast API key is required");
  }

  const endpoint =
    options.endpoint ?? "https://datafa.st/api/v1/payments";

  return {
    async trackPayment(payment: CreemPayment): Promise<void> {
      if (payment.status !== "paid") return;

      if (!payment.id || !payment.currency) {
        throw new Error("Payment ID and currency are required");
      }

      if (
        !Number.isFinite(payment.amount) ||
        payment.amount <= 0
      ) {
        throw new Error("Amount must be positive");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.datafastApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: payment.amount,
          currency: payment.currency,
          transaction_id: payment.id,
          email: payment.customerEmail,
          datafast_visitor_id: payment.visitorId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `DataFast API error (${response.status}): ${await response.text()}`
        );
      }
    },
  };
}

type WebhookEvent = {
  eventType?: string;
  object?: any;
};

export function createCreemWebhookHandler(
  bridge: ReturnType<typeof createCreemDataFastBridge>,
  webhookSecret: string
) {
  return async (
    rawBody: string | Buffer,
    signature: string | undefined
  ): Promise<{ status: number; body: string }> => {
    if (
      !signature ||
      !verifyCreemWebhookSignature(
        rawBody,
        signature,
        webhookSecret
      )
    ) {
      return { status: 401, body: "Invalid signature" };
    }

    let event: WebhookEvent;

    try {
      event = JSON.parse(rawBody.toString()) as WebhookEvent;
    } catch {
      return { status: 400, body: "Invalid JSON" };
    }

    try {
      const object = event.object;

      if (event.eventType === "checkout.completed") {
        const order = object?.order;
        const amount = order?.amount;
        const currency = String(
          order?.currency ?? ""
        ).toUpperCase();

        if (
          order?.status === "paid" &&
          order?.id &&
          typeof amount === "number" &&
          Number.isFinite(amount) &&
          amount > 0 &&
          currency
        ) {
          await bridge.trackPayment({
            id: String(order.id),
            amount,
            currency,
            status: "paid",
            customerEmail: object?.customer?.email,
            visitorId: object?.metadata?.datafast_visitor_id,
          });
        }
      } else if (event.eventType === "subscription.paid") {
        const amount = object?.product?.price;
        const currency = String(
          object?.product?.currency ?? ""
        ).toUpperCase();

        if (
          object?.last_transaction_id &&
          typeof amount === "number" &&
          Number.isFinite(amount) &&
          amount > 0 &&
          currency
        ) {
          await bridge.trackPayment({
            id: String(object.last_transaction_id),
            amount,
            currency,
            status: "paid",
            customerEmail: object?.customer?.email,
            visitorId: object?.metadata?.datafast_visitor_id,
          });
        }
      }

      return { status: 200, body: "OK" };
    } catch {
      return {
        status: 500,
        body: "Webhook processing failed",
      };
    }
  };
}
