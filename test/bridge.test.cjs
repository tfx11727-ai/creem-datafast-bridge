
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCreemDataFastBridge } = require("../dist/index.js");

test("sends a paid payment to DataFast", async () => {
  const originalFetch = global.fetch;
  let request;

  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, text: async () => "" };
  };

  try {
    const bridge = createCreemDataFastBridge({
      datafastApiKey: "df_test_key",
    });

    await bridge.trackPayment({
      id: "payment_123",
      amount: 19.99,
      currency: "USD",
      status: "paid",
      visitorId: "visitor_abc",
      customerEmail: "customer@example.com",
    });

    assert.equal(request.url, "https://datafa.st/api/v1/payments");
    assert.equal(request.options.method, "POST");
    assert.equal(
      request.options.headers.Authorization,
      "Bearer df_test_key"
    );

    assert.deepEqual(JSON.parse(request.options.body), {
      amount: 19.99,
      currency: "USD",
      transaction_id: "payment_123",
      email: "customer@example.com",
      datafast_visitor_id: "visitor_abc",
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("ignores payments that are not paid", async () => {
  const originalFetch = global.fetch;
  let called = false;

  global.fetch = async () => {
    called = true;
    return { ok: true, text: async () => "" };
  };

  try {
    const bridge = createCreemDataFastBridge({
      datafastApiKey: "df_test_key",
    });

    await bridge.trackPayment({
      id: "payment_pending",
      amount: 19.99,
      currency: "USD",
      status: "pending",
    });

    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects an invalid payment amount", async () => {
  const bridge = createCreemDataFastBridge({
    datafastApiKey: "df_test_key",
  });

  await assert.rejects(
    bridge.trackPayment({
      id: "payment_bad",
      amount: 0,
      currency: "USD",
      status: "paid",
    }),
    /Amount must be positive/
  );
});
