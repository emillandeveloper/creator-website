import { PrismaClient } from "@prisma/client";
import { Level38Error } from "../modules/level38/errors";

// Game-independent reward definitions. A game adapter will implement each action.
export const CHAOS_REWARDS = [
  { id: "give-potion", name: "Regalar una poción", category: "help", description: "Añadir una poción al inventario.", cost: 300, cooldownSeconds: 60 },
  { id: "heal-hp", name: "Curación de emergencia", category: "help", description: "Recuperar un 25 % de HP.", cost: 700, cooldownSeconds: 120 },
  { id: "halve-hp", name: "¡Media vida!", category: "sabotage", description: "Reducir los HP actuales a la mitad sin causar KO.", cost: 1000, cooldownSeconds: 180 },
  { id: "no-attack", name: "Prohibido Atacar", category: "sabotage", description: "Bloquear el comando Atacar durante tres turnos.", cost: 1200, cooldownSeconds: 180 },
  { id: "chaos-roulette", name: "Ruleta del caos", category: "random", description: "Un efecto sorpresa favorable o desfavorable.", cost: 2500, cooldownSeconds: 300 },
] as const;

export type ChaosRewardId = typeof CHAOS_REWARDS[number]["id"];
export type ChaosRewardUpdate = { cost: number; cooldownSeconds: number; enabled: boolean };

export function chaosReward(id: string) {
  return CHAOS_REWARDS.find((reward) => reward.id === id);
}

export function validateChaosRewardUpdate(input: unknown): ChaosRewardUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Level38Error(400, "Configuración no válida.");
  const data = input as Record<string, unknown>;
  if (!Number.isInteger(data.cost) || (data.cost as number) < 1 || (data.cost as number) > 1_000_000) {
    throw new Level38Error(400, "Los puntos deben ser un número entero entre 1 y 1.000.000.");
  }
  if (!Number.isInteger(data.cooldownSeconds) || (data.cooldownSeconds as number) < 0 || (data.cooldownSeconds as number) > 3600) {
    throw new Level38Error(400, "El tiempo de espera debe estar entre 0 y 3.600 segundos.");
  }
  if (typeof data.enabled !== "boolean") throw new Level38Error(400, "El estado de la recompensa no es válido.");
  return { cost: data.cost as number, cooldownSeconds: data.cooldownSeconds as number, enabled: data.enabled };
}

export class ChaosStore {
  constructor(private readonly db: PrismaClient) {}

  async state() {
    const [saved, activity] = await Promise.all([
      this.db.chaosReward.findMany(),
      this.db.chaosActivity.findMany({ orderBy: { occurredAt: "desc" }, take: 20 }),
    ]);
    const settings = new Map(saved.map((item) => [item.id, item]));
    return {
      // No EventSub subscription or game agent is active in this first phase.
      twitchConnected: false,
      gameConnected: false,
      rewards: CHAOS_REWARDS.map((reward) => {
        const override = settings.get(reward.id);
        return {
          ...reward,
          cost: override?.cost ?? reward.cost,
          cooldownSeconds: override?.cooldownSeconds ?? reward.cooldownSeconds,
          enabled: override?.enabled ?? false,
        };
      }),
      activity: activity.map(({ id, rewardId, viewer, source, status, occurredAt }) => ({ id, rewardId, viewer, source, status, occurredAt })),
    };
  }

  async saveReward(id: string, input: unknown) {
    if (!chaosReward(id)) throw new Level38Error(404, "Recompensa no encontrada.");
    const value = validateChaosRewardUpdate(input);
    await this.db.chaosReward.upsert({ where: { id }, create: { id, ...value }, update: value });
    return this.state();
  }

  async simulate(id: string) {
    const reward = chaosReward(id);
    if (!reward) throw new Level38Error(404, "Recompensa no encontrada.");
    const event = await this.db.chaosActivity.create({
      data: { rewardId: id, viewer: "Leo · prueba", source: "TEST", status: "SIMULATED" },
    });
    return { id: event.id, rewardId: id, name: reward.name, viewer: event.viewer, source: "TEST", occurredAt: event.occurredAt };
  }

  async currentOverlay() {
    // Never replay old redemptions when OBS reconnects.
    const event = await this.db.chaosActivity.findFirst({
      where: { OR: [{ source: "TEST", status: "SIMULATED" }, { source: "LOCAL", status: "APPLIED" }],
        occurredAt: { gte: new Date(Date.now() - 11_000) } },
      orderBy: { occurredAt: "desc" },
    });
    if (!event) return null;
    const reward = chaosReward(event.rewardId);
    if (!reward) return null;
    return {
      id: event.id,
      name: reward.name,
      category: reward.category,
      viewer: event.viewer,
      source: event.source,
      status: event.status,
      occurredAt: event.occurredAt,
    };
  }
}
