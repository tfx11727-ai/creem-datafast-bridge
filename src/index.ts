
export interface CreemPayment {
  id: string;
  customerEmail?: string;
  productId?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt?: string;
}

export interface DataFastEvent {
  name: string;
  revenue: number;
  currency: string;
  paymentId: string;
  customerEmail?: string;
}

export interface BridgeOptions {
  datafastWebsiteId: string;
  apiKey?: string;
  endpoint?: string;
}

export function createCreemDataFastBridge(
  options: BridgeOptions
) {
  if (!options.datafastWebsiteId) {
    throw new Error("DataFast website ID is required");
  }

  const endpoint =
    options.endpoint ?? "https://datafa.st/api/v1/events";

  return {
    async trackPayment(payment: CreemPayment): Promise<void> {
      if (payment.status !== "paid") {
        return;
      }

      if (!payment.id || payment.amount <= 0) {
        throw new Error("Invalid payment details");
      }

      const event: DataFastEvent = {
        name: "purchase",
        revenue: payment.amount,
        currency: payment.currency,
        paymentId: payment.id,
        customerEmail: payment.customerEmail,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${options.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          website_id: options.datafastWebsiteId,
          event_name: event.name,
          revenue: event.revenue,
          currency: event.currency,
          payment_id: event.paymentId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `DataFast request failed: ${response.status}`
        );
      }
    },
  };
}
￼Enter
