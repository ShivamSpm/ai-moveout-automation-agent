import "server-only";

import {
  A2A_PROTOCOL_VERSION,
  Role,
  TaskState,
  type AgentCard,
  type Message,
  type Part,
  type Task,
} from "@a2a-js/sdk";
import {
  AgentEvent,
  DefaultRequestHandler,
  JsonRpcTransportHandler,
  ServerCallContext,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
  type TaskStore,
  type User,
} from "@a2a-js/sdk/server";
import { z } from "zod";
import { env } from "../env";
import { serviceClient } from "../supabase";
import {
  BridgeError,
  BuyerMessageInput,
  ClaimInput,
  ReportInput,
  claimTask,
  getTask,
  listListings,
  listTasks,
  relayBuyerMessage,
  reportResult,
  type BridgeOwner,
} from "./bridge";

// A2A 1.0 face of the Muse bridge. The renter's Muse agent is the A2A client:
// it asks this agent for approved marketplace work, performs it on Facebook
// with the renter's account, and reports back on the same task.

export function agentCard(): AgentCard {
  const base = env.appUrl();
  return {
    name: "Vacate move-out agent",
    description:
      "Hands a renter's own Muse agent the Facebook Marketplace listings, buyer replies and pickup confirmations the renter approved in Vacate, and records the results Muse reports. It never posts or messages by itself.",
    supportedInterfaces: [
      { url: `${base}/api/a2a`, protocolBinding: "JSONRPC", tenant: "", protocolVersion: A2A_PROTOCOL_VERSION },
    ],
    provider: { organization: "Vacate (hackathon project)", url: base },
    version: "0.1.0",
    documentationUrl: `${base}/muse`,
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: {
      connectorToken: {
        scheme: {
          $case: "httpAuthSecurityScheme",
          value: {
            description: "Per-renter connector token created on the Vacate Muse page (vac_…).",
            scheme: "Bearer",
            bearerFormat: "opaque",
          },
        },
      },
    },
    securityRequirements: [{ schemes: { connectorToken: { list: [] } } }],
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: "marketplace-work-queue",
        name: "Approved Marketplace work",
        description:
          'Send {"op":"list_tasks"} to get approved work, {"op":"claim","taskId","payloadHash"} before doing it, then {"op":"report","taskId","payloadHash","status","externalUrl"} on the same A2A task.',
        tags: ["facebook-marketplace", "muse", "reviewed-actions"],
        examples: ['{"op":"list_tasks"}'],
        inputModes: ["application/json", "text/plain"],
        outputModes: ["application/json"],
        securityRequirements: [],
      },
      {
        id: "buyer-message-relay",
        name: "Relay buyer messages",
        description:
          'Send {"op":"buyer_message","listingId","buyerName","message","threadRef"} when a buyer writes about a listing. The renter reviews any reply here first.',
        tags: ["facebook-marketplace", "messages"],
        examples: ['{"op":"list_listings"}'],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
        securityRequirements: [],
      },
    ],
    signatures: [],
  } as unknown as AgentCard;
}

class RenterUser implements User {
  constructor(private readonly ownerId: string) {}
  get isAuthenticated() {
    return true;
  }
  get userName() {
    return this.ownerId;
  }
}

const ownerOf = (context: ServerCallContext): BridgeOwner => {
  const user = context.user;
  if (!user?.isAuthenticated) throw new BridgeError("Not authenticated", 401);
  return { ownerId: user.userName };
};

// Tasks persist in Postgres so they survive serverless instances; each row is
// owned by the renter the connector token resolved to.
class SupabaseTaskStore implements TaskStore {
  async save(task: Task, context: ServerCallContext) {
    const { ownerId } = ownerOf(context);
    const actionId = (task.metadata as { actionId?: string } | undefined)?.actionId ?? null;
    const { error } = await serviceClient().rpc("a2a_task_save", {
      p_owner_id: ownerId,
      p_id: task.id,
      p_task: task as never,
      p_action_id: actionId as never,
    });
    if (error) throw new BridgeError(error.message, 500);
  }
  async load(taskId: string, context: ServerCallContext) {
    const { ownerId } = ownerOf(context);
    const { data, error } = await serviceClient().rpc("a2a_task_load", { p_owner_id: ownerId, p_id: taskId });
    if (error) throw new BridgeError(error.message, 500);
    return (data as Task | null) ?? undefined;
  }
  async list() {
    return { tasks: [], nextPageToken: "", pageSize: 0, totalSize: 0 } as never;
  }
}

const dataPart = (value: unknown): Part => ({
  content: { $case: "data", value },
  metadata: undefined,
  filename: "",
  mediaType: "application/json",
});
const textPart = (value: string): Part => ({
  content: { $case: "text", value },
  metadata: undefined,
  filename: "",
  mediaType: "text/plain",
});

function agentMessage(ctx: RequestContext, parts: Part[], taskId = ""): Message {
  return {
    messageId: crypto.randomUUID(),
    contextId: ctx.contextId,
    taskId,
    role: Role.ROLE_AGENT,
    parts,
    metadata: {},
    extensions: [],
    referenceTaskIds: [],
  };
}

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("list_tasks") }),
  z.object({ op: z.literal("list_listings") }),
  z.object({ op: z.literal("get_task"), taskId: z.uuid() }),
  ClaimInput.extend({ op: z.literal("claim") }),
  ReportInput.extend({ op: z.literal("report") }).partial({ taskId: true }),
  BuyerMessageInput.extend({ op: z.literal("buyer_message") }),
]);

function readOp(message: Message): z.infer<typeof Op> {
  for (const part of message.parts) {
    if (part.content?.$case === "data") return Op.parse(part.content.value);
    if (part.content?.$case === "text") {
      const text = part.content.value.trim();
      if (text.startsWith("{")) return Op.parse(JSON.parse(text));
      if (/\b(list|what|next|tasks?|work)\b/i.test(text)) return { op: "list_tasks" };
    }
  }
  throw new BridgeError('Send a JSON data part such as {"op":"list_tasks"}');
}

class MuseBridgeExecutor implements AgentExecutor {
  // Work is performed by Muse, not here; there is nothing running to stop.
  cancelTask = async () => {};

  async execute(ctx: RequestContext, bus: ExecutionEventBus) {
    const owner = ownerOf(ctx.context);
    const reply = (value: unknown) => bus.publish(AgentEvent.message(agentMessage(ctx, [dataPart(value)])));
    let op: z.infer<typeof Op>;
    try {
      op = readOp(ctx.userMessage);
    } catch (e) {
      reply({ error: e instanceof Error ? e.message : "Invalid request" });
      return;
    }

    try {
      switch (op.op) {
        case "list_tasks":
          return reply({ tasks: await listTasks(owner) });
        case "list_listings":
          return reply({ listings: await listListings(owner) });
        case "get_task":
          return reply({ task: await getTask(owner, op.taskId) });
        case "buyer_message":
          return reply(await relayBuyerMessage(owner, op));
        case "claim": {
          const work = await getTask(owner, op.taskId);
          const result = await claimTask(owner, op);
          if (!result.claimed) return reply(result);
          const task: Task = {
            id: ctx.taskId,
            contextId: ctx.contextId,
            status: {
              state: TaskState.TASK_STATE_WORKING,
              message: agentMessage(
                ctx,
                [textPart(`Claimed. ${work.instructions} Report on this A2A task when done.`)],
                ctx.taskId,
              ),
              timestamp: new Date().toISOString(),
            },
            artifacts: [
              {
                artifactId: `work-${work.taskId}`,
                name: work.title,
                description: "Exact approved work to perform on the renter's account",
                parts: [dataPart({ ...work, state: "claimed" })],
                metadata: undefined,
                extensions: [],
              },
            ],
            history: [ctx.userMessage],
            metadata: { actionId: work.taskId, payloadHash: work.payloadHash },
          };
          bus.publish(AgentEvent.task(task));
          return;
        }
        case "report": {
          const meta = (ctx.task?.metadata ?? {}) as { actionId?: string; payloadHash?: string };
          const taskId = op.taskId ?? meta.actionId;
          if (!taskId) throw new BridgeError("Report on the A2A task returned by claim, or include taskId");
          const recorded = await reportResult(owner, { ...op, taskId });
          const state =
            op.status === "succeeded"
              ? TaskState.TASK_STATE_COMPLETED
              : op.status === "failed"
                ? TaskState.TASK_STATE_FAILED
                : TaskState.TASK_STATE_WORKING;
          const note =
            op.status === "unknown"
              ? "Recorded as unknown. Check the renter's account before any retry; do not repeat the action blindly."
              : `Recorded as ${op.status}.`;
          bus.publish(
            AgentEvent.task({
              id: ctx.taskId,
              contextId: ctx.contextId,
              status: {
                state,
                message: agentMessage(ctx, [textPart(note), dataPart(recorded)], ctx.taskId),
                timestamp: new Date().toISOString(),
              },
              artifacts: ctx.task?.artifacts ?? [],
              history: [...(ctx.task?.history ?? []), ctx.userMessage],
              metadata: { actionId: taskId, payloadHash: op.payloadHash },
            }),
          );
          return;
        }
      }
    } catch (e) {
      reply({ error: e instanceof Error ? e.message : "Request failed", status: e instanceof BridgeError ? e.status : 500 });
    }
  }
}

let transport: JsonRpcTransportHandler | undefined;

export function a2aTransport() {
  transport ??= new JsonRpcTransportHandler(
    new DefaultRequestHandler(agentCard(), new SupabaseTaskStore(), new MuseBridgeExecutor()),
  );
  return transport;
}

export function callContext(owner: BridgeOwner, requestedVersion: string | null) {
  return new ServerCallContext({ user: new RenterUser(owner.ownerId), requestedVersion: requestedVersion ?? undefined });
}
