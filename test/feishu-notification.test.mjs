import assert from "node:assert/strict";
import test from "node:test";
import { sendFeishuNotification } from "../scripts/lib/feishu-notification.mjs";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("Feishu notification previews when no delivery method is configured", async () => {
  assert.equal(
    await sendFeishuNotification({ text: "周报", env: {}, fetchImpl: null }),
    "preview",
  );
});

test("Feishu webhook receives a text message", async () => {
  let request;
  const mode = await sendFeishuNotification({
    text: "周报",
    env: { FEISHU_WEBHOOK_URL: "https://example.invalid/hook" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ code: 0 });
    },
  });

  assert.equal(mode, "webhook");
  assert.equal(request.url, "https://example.invalid/hook");
  assert.deepEqual(JSON.parse(request.options.body), {
    msg_type: "text",
    content: { text: "周报" },
  });
});

test("Feishu webhook rejects an HTTP 200 application error", async () => {
  await assert.rejects(
    sendFeishuNotification({
      text: "周报",
      env: { FEISHU_WEBHOOK_URL: "https://example.invalid/hook" },
      fetchImpl: async () => jsonResponse({ code: 19024 }),
    }),
    /Feishu webhook failed/,
  );
});

test("Feishu app bot obtains a tenant token and sends to the owner open_id", async () => {
  const requests = [];
  const mode = await sendFeishuNotification({
    text: "周报",
    env: {
      FEISHU_BOT_APP_ID: "cli_test",
      FEISHU_BOT_APP_SECRET: "secret_test",
      FEISHU_BOT_RECEIVE_ID: "ou_owner",
      GITHUB_RUN_ID: "123",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? jsonResponse({ code: 0, tenant_access_token: "tenant-token" })
        : jsonResponse({ code: 0, data: {} });
    },
  });

  assert.equal(mode, "app_bot");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /tenant_access_token\/internal$/);
  assert.match(requests[1].url, /receive_id_type=open_id$/);
  assert.equal(requests[1].options.headers.authorization, "Bearer tenant-token");
  const message = JSON.parse(requests[1].options.body);
  assert.equal(message.receive_id, "ou_owner");
  assert.deepEqual(JSON.parse(message.content), { text: "周报" });
  assert.equal(message.uuid.length, 40);
});

test("Feishu app bot rejects partial credentials", async () => {
  await assert.rejects(
    sendFeishuNotification({
      text: "周报",
      env: { FEISHU_BOT_APP_ID: "cli_test" },
    }),
    /Incomplete FEISHU_BOT/,
  );
});
