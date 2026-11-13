import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { Level38Error } from "../modules/level38/errors";
import { chaosReward } from "./chaos";

const AGENT_ID = "ffx";
const HEARTBEAT_TTL_MS = 15_000;
const COMMAND_TTL_MS = 30_000;

const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

export class ChaosAgentBridge {
  constructor(private readonly db: PrismaClient) {}

  async pair(): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.db.chaosAgent.upsert({
      where: { id: AGENT_ID },
      create: { id: AGENT_ID, tokenHash: tokenHash(token) },
      update: { tokenHash: tokenHash(token), gameRunning: false, lastSeenAt: null },
    });
    return token; // Shown once to the authenticated OWNER; never persisted in plaintext.
  }

  async status() {
    const agent = await this.db.chaosAgent.findUnique({ where: { id: AGENT_ID } });
    const connected = Boolean(agent?.lastSeenAt && Date.now() - agent.lastSeenAt.getTime() < HEARTBEAT_TTL_MS);
    return { paired: Boolean(agent), connected, gameRunning: connected && Boolean(agent?.gameRunning), lastSeenAt: agent?.lastSeenAt ?? null };
  }

  private async authenticate(authorization: string | undefined): Promise<string> {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
    if (!match) throw new Level38Error(401, "Unauthorized local agent.");
    const hash = tokenHash(match[1]);
    const agent = await this.db.chaosAgent.findUnique({ where: { id: AGENT_ID } });
    if (agent?.tokenHash !== hash) throw new Level38Error(401, "Unauthorized local agent.");
    return hash;
  }

  async heartbeat(authorization: string | undefined, data: unknown) {
    const hash = await this.authenticate(authorization);
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof (data as { gameRunning?: unknown }).gameRunning !== "boolean") {
      throw new Level38Error(400, "Invalid heartbeat.");
    }
    const result = await this.db.chaosAgent.updateMany({
      where: { id: AGENT_ID, tokenHash: hash },
      data: { gameRunning: (data as { gameRunning: boolean }).gameRunning, lastSeenAt: new Date() },
    });
    if (result.count !== 1) throw new Level38Error(401, "Unauthorized local agent.");
    return { ok: true };
  }

  async queueTest(rewardId: string) {
    if (!chaosReward(rewardId)) throw new Level38Error(404, "Recompensa no encontrada.");
    if (!(await this.status()).connected) throw new Level38Error(409, "Conecta primero el agente local de FFX.");
    return this.db.chaosCommand.create({
      data: { rewardId, expiresAt: new Date(Date.now() + COMMAND_TTL_MS) },
    });
  }

  async claim(authorization: string | undefined) {
    await this.authenticate(authorization);
    for (let retry = 0; retry < 3; retry++) {
      const now = new Date();
      const command = await this.db.chaosCommand.findFirst({
        where: { status: "PENDING", expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
      });
      if (!command) return null;
      const changed = await this.db.chaosCommand.updateMany({
        where: { id: command.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "CLAIMED", claimedAt: new Date() },
      });
      if (changed.count === 1) return { id: command.id, rewardId: command.rewardId, mode: "DRY_RUN" as const };
    }
    return null;
  }

  async acknowledge(authorization: string | undefined, data: unknown) {
    await this.authenticate(authorization);
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof (data as { id?: unknown }).id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test((data as { id: string }).id)) throw new Level38Error(400, "Invalid acknowledgement.");
    const id = (data as { id: string }).id;
    const command = await this.db.chaosCommand.findUnique({ where: { id } });
    if (!command) throw new Level38Error(404, "Command not found.");
    const updated = await this.db.chaosCommand.updateMany({
      where: { id, status: "CLAIMED", expiresAt: { gt: new Date() } },
      data: { status: "DRY_RUN", acknowledgedAt: new Date() },
    });
    if (updated.count !== 1) throw new Level38Error(409, "Command has expired or was already acknowledged.");
    await this.db.chaosActivity.create({
      data: { rewardId: command.rewardId, viewer: "Leo · conector FFX", source: "TEST", status: "SIMULATED" },
    });
    return { ok: true };
  }
}
