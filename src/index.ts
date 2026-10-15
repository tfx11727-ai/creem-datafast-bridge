
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
     

      if (!payment.id || !payment.currency) {
        throw new Error("Payment ID and currency are required");
    

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
function creemAmountToMajorUnits(
  amount: number,
  currency: string
): number {
  const decimals = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;

  return amount / Math.pow(10, decimals);
}

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

    let event: any;

    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return { status: 400, body: "Invalid JSON" };
    }

    try {
      const object = event.object;

      if (event.eventType === "checkout.completed") {
        const order = object?.order;

        if (order?.status === "paid") {
          const currency = String(order.currency ?? "").toUpperCase();

          await bridge.trackPayment({
            id: order.id,
            amount: creemAmountToMajorUnits(
              amount,
              currency
            ),
            currency,
            status: "paid",
            customerEmail: object?.customer?.email,
            visitorId: object?.metadata?.datafast_visitor_id,
          });
        }
      } else if (event.eventType === "subscription.paid") {
        const currency = String(
          object?.product?.currency ?? ""
        ).toUpperCase();

        if (
          object?.last_transaction_id &&
          currency &&
          Number.isFinite(object?.product?.price)
        ) {
          await bridge.trackPayment({
            id: object.last_transaction_id,
            amount: creemAmountToMajorUnits(
              object.product.price,
              currency
            ),
            currency,
            status: "paid",
            customerEmail: object?.customer?.email,
            visitorId: object?.metadata?.datafast_visitor_id,
          });
        }
      }

      return { status: 200, body: "OK" };
    } catch {
      return { status: 500, body: "Webhook processing failed" };
    }
  };
}

