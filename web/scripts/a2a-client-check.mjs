// A2A client check using the official SDK, standing in for an A2A-capable
// agent such as Muse. By default it only discovers the Agent Card and lists
// approved work. With --simulate-post it claims the first listing task and
// reports a SIMULATED Marketplace URL: for local protocol tests only, never
// against a real renter's account.
//
//   VACATE_URL=http://localhost:3100 VACATE_CONNECTOR_TOKEN=vac_... node scripts/a2a-client-check.mjs [--simulate-post]

import { ClientFactory } from "@a2a-js/sdk/client";

const base = process.env.VACATE_URL ?? "http://localhost:3100";
const token = process.env.VACATE_CONNECTOR_TOKEN;
if (!token) throw new Error("Set VACATE_CONNECTOR_TOKEN (create one on /muse)");
const simulate = process.argv.includes("--simulate-post");
const opts = { serviceParameters: { Authorization: `Bearer ${token}` } };

const client = await new ClientFactory().createFromUrl(base);
const card = await client.getAgentCard();
console.log("agent card:", card.name, card.supportedInterfaces?.map((i) => `${i.protocolBinding}@${i.protocolVersion}`));

const send = (data, taskId) =>
  client.sendMessage(
    {
      message: {
        messageId: crypto.randomUUID(),
        role: 1, // ROLE_USER
        taskId: taskId ?? "",
        contextId: "",
        parts: [{ content: { $case: "data", value: data }, mediaType: "application/json", filename: "", metadata: undefined }],
        metadata: {},
        extensions: [],
        referenceTaskIds: [],
      },
    },
    opts,
  );
// sendMessage resolves to a Message or a Task.
const dataOf = (result) => (result?.parts ?? result?.status?.message?.parts)?.map((p) => p.content?.value);

const listed = await send({ op: "list_tasks" });
const tasks = dataOf(listed)?.[0]?.tasks ?? [];
console.log("approved work:", tasks.map((t) => ({ taskId: t.taskId, kind: t.kind, title: t.title, state: t.state })));

const work = tasks.find((t) => t.kind === "listing.publish" && t.state === "ready");
if (!simulate || !work) process.exit(0);

const claimed = await send({ op: "claim", taskId: work.taskId, payloadHash: work.payloadHash });
const task = claimed;
console.log("claim -> A2A task", task?.id, "state", task?.status?.state);

const reported = await send(
  {
    op: "report",
    payloadHash: work.payloadHash,
    status: "succeeded",
    externalUrl: "https://www.facebook.com/marketplace/item/1000000000000999/",
    note: "SIMULATED by scripts/a2a-client-check.mjs; nothing was posted",
  },
  task.id,
);
console.log("report -> state", reported?.status?.state, dataOf(reported));
