import { createHash } from "node:crypto";

const TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const MESSAGE_URL =
  "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id";

export async function sendFeishuNotification({
  text,
  env = process.env,
  fetchImpl = fetch,
}) {
  if (typeof text !== "string" || !text.trim()) {
    throw new TypeError("Feishu notification text is required");
  }

  if (env.FEISHU_WEBHOOK_URL) {
    await sendWebhook(fetchImpl, env.FEISHU_WEBHOOK_URL, text);
    return "webhook";
  }

  const appId = env.FEISHU_BOT_APP_ID;
  const appSecret = env.FEISHU_BOT_APP_SECRET;
  const receiveId = env.FEISHU_BOT_RECEIVE_ID;
  const configured = [appId, appSecret, receiveId].filter(Boolean).length;
  if (configured === 0) return "preview";
  if (configured !== 3) {
    throw new Error("Incomplete FEISHU_BOT_* configuration");
  }

  await sendAppBot(fetchImpl, {
    appId,
    appSecret,
    receiveId,
    text,
    uuid: messageUuid(text, env),
  });
  return "app_bot";
}

async function sendWebhook(fetchImpl, webhook, text) {
  const response = await fetchImpl(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  });
  const payload = await readJson(response);
  const code = payload?.code ?? payload?.StatusCode;
  if (!response.ok || code !== 0) {
    throw new Error(`Feishu webhook failed with HTTP ${response.status}`);
  }
}

async function sendAppBot(
  fetchImpl,
  { appId, appSecret, receiveId, text, uuid },
) {
  const tokenResponse = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenPayload = await readJson(tokenResponse);
  if (
    !tokenResponse.ok ||
    tokenPayload?.code !== 0 ||
    typeof tokenPayload.tenant_access_token !== "string"
  ) {
    throw new Error(`Feishu app token failed with HTTP ${tokenResponse.status}`);
  }

  const messageResponse = await fetchImpl(MESSAGE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenPayload.tenant_access_token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: "text",
      content: JSON.stringify({ text }),
      uuid,
    }),
  });
  const messagePayload = await readJson(messageResponse);
  if (!messageResponse.ok || messagePayload?.code !== 0) {
    throw new Error(`Feishu app message failed with HTTP ${messageResponse.status}`);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function messageUuid(text, env) {
  const run = env.GITHUB_RUN_ID || new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${run}\0${text}`, "utf8")
    .digest("hex")
    .slice(0, 40);
}
