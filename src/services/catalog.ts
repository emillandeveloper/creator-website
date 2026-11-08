import { randomBytes } from "crypto";
import { CatalogGame, Prisma, PrismaClient } from "@prisma/client";
import { GAMES, GameProject, I18nText } from "../models/data";
import { CHALLENGES, ChallengeDetails } from "../models/challenges";
import { Level38Error } from "../modules/level38/errors";

export interface CatalogEntry extends GameProject {
  id: string;
  revision: number;
  challengeSlug: string;
  details: Omit<ChallengeDetails, "slug" | "gameTitle">;
}

const emptyText = (): I18nText => ({ en: "", es: "" });
export const emptyDetails = (): CatalogEntry["details"] => ({ format: emptyText(), rules: [], outcome: emptyText() });
const slugify = (title: string): string => title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "game";

// Repository entries remain the defaults; an owner's saved version takes precedence.
// Deployments never re-seed or overwrite edits made through the admin.
export const DEFAULT_CATALOG: CatalogEntry[] = GAMES.map(game => {
  const challenge = CHALLENGES.find(item => item.gameTitle === game.title);
  const id = challenge?.slug ?? `playthrough-${slugify(game.title)}`;
  return { ...game, id, revision: 0, challengeSlug: id,
    details: challenge ? { format: challenge.format, rules: challenge.rules, outcome: challenge.outcome } : emptyDetails() };
});

function fromRow(row: CatalogGame): CatalogEntry {
  return { id: row.id, title: row.title, type: row.type as GameProject["type"], status: row.status as GameProject["status"],
    description: { en: row.descriptionEn, es: row.descriptionEs }, cover: row.cover, coverScale: row.coverScale,
    coverOutline: row.coverOutline, revision: row.revision, challengeSlug: row.id,
    details: row.details ? row.details as unknown as CatalogEntry["details"] : emptyDetails() };
}

export class CatalogStore {
  constructor(readonly db?: PrismaClient) {}

  async list(): Promise<CatalogEntry[]> {
    if (!this.db) return DEFAULT_CATALOG;
    let rows: CatalogGame[];
    try { rows = await this.db.catalogGame.findMany({ orderBy: { createdAt: "asc" } }); }
    catch (error) {
      // Keep the original public site available during an initial migration/bootstrap.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return DEFAULT_CATALOG;
      throw error;
    }
    const entries = new Map(DEFAULT_CATALOG.map(game => [game.id, game]));
    for (const row of rows) entries.set(row.id, fromRow(row));
    return [...entries.values()];
  }

  async save(id: string | undefined, input: CatalogInput, ownerId: string, logo?: Buffer): Promise<CatalogEntry> {
    if (!this.db) throw new Level38Error(503, "El catálogo no está configurado todavía.");
    const previous = id ? (await this.list()).find(game => game.id === id) : undefined;
    if (id && !previous) throw new Level38Error(404, "No se ha encontrado ese juego.");
    if (previous && previous.revision !== input.revision) throw new Level38Error(409, "Este juego ha cambiado en otra ventana. Recarga la lista antes de editarlo.");
    if (!previous && !logo) throw new Level38Error(400, "Sube el logo del juego.");
    const gameId = id ?? `${slugify(input.title)}-${randomBytes(4).toString("hex")}`;
    const revision = (previous?.revision ?? 0) + 1;
    const data = { title: input.title, type: input.type, status: input.status,
      descriptionEn: input.description.en, descriptionEs: input.description.es,
      cover: logo ? `/media/catalog/${gameId}?v=${revision}` : previous!.cover,
      coverScale: input.coverScale, coverOutline: input.coverOutline,
      details: input.details as unknown as Prisma.InputJsonValue, updatedBy: ownerId };
    try {
      const row = await this.db.$transaction(async tx => {
        if (previous?.revision) {
          const updated = await tx.catalogGame.updateMany({ where: { id: gameId, revision: input.revision }, data: { ...data, revision: { increment: 1 } } });
          if (!updated.count) throw new Level38Error(409, "Este juego ha cambiado en otra ventana. Recarga la lista antes de editarlo.");
        } else {
          await tx.catalogGame.create({ data: { ...data, id: gameId, revision } });
        }
        if (logo) await tx.catalogLogo.upsert({ where: { gameId }, create: { gameId, data: new Uint8Array(logo), mimeType: "image/webp" }, update: { data: new Uint8Array(logo), mimeType: "image/webp" } });
        return tx.catalogGame.findUniqueOrThrow({ where: { id: gameId } });
      });
      return fromRow(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Level38Error(409, "Este juego acaba de cambiar. Recarga la lista antes de editarlo.");
      throw error;
    }
  }
}

export interface CatalogInput {
  title: string; type: GameProject["type"]; status: GameProject["status"];
  description: I18nText; details: CatalogEntry["details"];
  revision: number; coverScale: number; coverOutline: boolean;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Level38Error(400, "Revisa los datos del formulario.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Level38Error(400, "Uno de los textos no es válido o es demasiado largo.");
  return value.trim();
}
function bilingual(value: unknown, max: number): I18nText {
  const source = object(value), en = text(source.en ?? "", max), es = text(source.es ?? "", max);
  return { en: en || es, es: es || en };
}
export function catalogInput(value: unknown): CatalogInput {
  const body = object(value), title = text(body.title, 160);
  if (!title || !["challenge", "playthrough"].includes(body.type as string) || !["playing", "completed", "upcoming"].includes(body.status as string)) throw new Level38Error(400, "Completa el nombre, el tipo y el estado del juego.");
  const description = bilingual(body.description, 4000);
  if (!description.en) throw new Level38Error(400, "Añade una descripción en al menos un idioma.");
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) throw new Level38Error(400, "Recarga el juego antes de guardar.");
  const coverScale = body.coverScale ?? 1, coverOutline = body.coverOutline ?? false;
  if (typeof coverScale !== "number" || coverScale < 0.5 || coverScale > 2 || typeof coverOutline !== "boolean") throw new Level38Error(400, "Revisa los ajustes del logo.");
  const rawDetails = object(body.details ?? {});
  const rulesText = bilingual(rawDetails.rules ?? {}, 8000);
  const enRules = rulesText.en.split("\n").map(s => s.trim()).filter(Boolean), esRules = rulesText.es.split("\n").map(s => s.trim()).filter(Boolean);
  if (enRules.length > 40 || esRules.length > 40) throw new Level38Error(400, "Puedes añadir hasta 40 reglas.");
  const rules = Array.from({ length: Math.max(enRules.length, esRules.length) }, (_, i) => ({ en: enRules[i] ?? esRules[i], es: esRules[i] ?? enRules[i] }));
  return { title, type: body.type as GameProject["type"], status: body.status as GameProject["status"], description,
    revision: body.revision as number, coverScale, coverOutline,
    details: { format: bilingual(rawDetails.format ?? {}, 100), rules, outcome: bilingual(rawDetails.outcome ?? {}, 4000) } };
}
