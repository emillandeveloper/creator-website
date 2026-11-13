import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { Level38Error } from "../modules/level38/errors";
import { chaosReward } from "./chaos";

const AGENT_ID = "ffx";
const HEARTBEAT_TTL_MS = 15_000;
const COMMAND_TTL_MS = 30_000;
const LIVE_POTION_REWARD = "give-potion";

const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

export class ChaosAgentBridge {
  constructor(private readonly db: PrismaClient) {}

  async pair(): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    // Rotating a key must never leave a real write waiting for the next PC session.
    await this.db.chaosCommand.updateMany({
      where: { mode: "LIVE", status: { in: ["PENDING", "CLAIMED"] } },
      data: { status: "CANCELLED" },
    });
    await this.db.chaosAgent.upsert({
      where: { id: AGENT_ID },
      create: { id: AGENT_ID, tokenHash: tokenHash(token) },
      update: { tokenHash: tokenHash(token), gameRunning: false, livePotionArmed: false, lastSeenAt: null },
    });
    return token; // Shown once to the authenticated OWNER; never persisted in plaintext.
  }

  async status() {
    const agent = await this.db.chaosAgent.findUnique({ where: { id: AGENT_ID } });
    const connected = Boolean(agent?.lastSeenAt && Date.now() - agent.lastSeenAt.getTime() < HEARTBEAT_TTL_MS);
    const gameRunning = connected && Boolean(agent?.gameRunning);
    return { paired: Boolean(agent), connected, gameRunning,
      livePotionArmed: gameRunning && Boolean(agent?.livePotionArmed), lastSeenAt: agent?.lastSeenAt ?? null };
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
    const update = data as { gameRunning: boolean; livePotionArmed?: unknown };
    if (update.livePotionArmed !== undefined && typeof update.livePotionArmed !== "boolean") {
      throw new Level38Error(400, "Invalid live potion status.");
    }
    const result = await this.db.chaosAgent.updateMany({
      where: { id: AGENT_ID, tokenHash: hash },
      data: { gameRunning: update.gameRunning, livePotionArmed: update.gameRunning && update.livePotionArmed === true, lastSeenAt: new Date() },
    });
    if (result.count !== 1) throw new Level38Error(401, "Unauthorized local agent.");
    return { ok: true };
  }

  async queueTest(rewardId: string) {
    if (!chaosReward(rewardId)) throw new Level38Error(404, "Recompensa no encontrada.");
    if (!(await this.status()).connected) throw new Level38Error(409, "Conecta primero el agente local de FFX.");
    return this.db.chaosCommand.create({
      data: { rewardId, mode: "DRY_RUN", expiresAt: new Date(Date.now() + COMMAND_TTL_MS) },
    });
  }

  async queueLivePotion() {
    const state = await this.status();
    if (!state.livePotionArmed) {
      throw new Level38Error(409, "Activa primero la prueba real de poción en el conector local de FFX.");
    }
    // A live effect requires an explicit owner click, a locally armed agent and a running game.
    // Do not allow two live commands to be outstanding in the same session.
    const pending = await this.db.chaosCommand.findFirst({
      where: { mode: "LIVE", status: { in: ["PENDING", "CLAIMED"] }, expiresAt: { gt: new Date() } },
    });
    if (pending) throw new Level38Error(409, "Ya hay una orden real pendiente. Espera a que termine.");
    return this.db.chaosCommand.create({
      data: { rewardId: LIVE_POTION_REWARD, mode: "LIVE", expiresAt: new Date(Date.now() + COMMAND_TTL_MS) },
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
      if (changed.count === 1) return { id: command.id, rewardId: command.rewardId,
        mode: command.mode === "LIVE" ? "LIVE" as const : "DRY_RUN" as const };
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
    const result = (data as { result?: unknown }).result;
    if (command.mode === "LIVE" && result !== "APPLIED" && result !== "FAILED") {
      throw new Level38Error(400, "A live command requires an explicit result.");
    }
    const nextStatus = command.mode === "LIVE" ? result as "APPLIED" | "FAILED" : "DRY_RUN";
    await this.db.$transaction(async (tx) => {
      const updated = await tx.chaosCommand.updateMany({
        where: { id, status: "CLAIMED", expiresAt: { gt: new Date() } },
        data: { status: nextStatus, acknowledgedAt: new Date() },
      });
      if (updated.count !== 1) throw new Level38Error(409, "Command has expired or was already acknowledged.");
      await tx.chaosActivity.create({
        data: command.mode === "LIVE"
          ? { rewardId: command.rewardId, viewer: "Leo · prueba real FFX", source: "LOCAL", status: nextStatus }
          : { rewardId: command.rewardId, viewer: "Leo · conector FFX", source: "TEST", status: "SIMULATED" },
      });
    });
    return { ok: true };
  }
}
