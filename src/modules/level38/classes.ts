import { randomInt } from "crypto";

// Stable IDs are persisted; names and asset metadata are resolved here, never on participants.
// Retain retired entries with enabled: false so existing assignments still display correctly.
interface Sprite { path: string; frameWidth: number; frameHeight: number; frames: number; fps: number; demo: boolean }
interface ClassDefinition { id: string; displayName: string; displayNameEs: string; enabled?: boolean; sprite?: Sprite }
// Optional enabled/sprite fields override the defaults on any individual entry.
const roster: ClassDefinition[] = [
  { id: "knight", displayName: "Knight", displayNameEs: "Caballero" }, { id: "dark-knight", displayName: "Dark Knight", displayNameEs: "Caballero oscuro" },
  { id: "dragoon", displayName: "Dragoon", displayNameEs: "Dragoon" }, { id: "monk", displayName: "Monk", displayNameEs: "Monje" },
  { id: "thief", displayName: "Thief", displayNameEs: "Ladrón" }, { id: "ninja", displayName: "Ninja", displayNameEs: "Ninja" },
  { id: "samurai", displayName: "Samurai", displayNameEs: "Samurái" }, { id: "ranger", displayName: "Ranger", displayNameEs: "Explorador" },
  { id: "black-mage", displayName: "Black Mage", displayNameEs: "Mago negro" }, { id: "white-mage", displayName: "White Mage", displayNameEs: "Mago blanco" },
  { id: "red-mage", displayName: "Red Mage", displayNameEs: "Mago rojo" }, { id: "blue-mage", displayName: "Blue Mage", displayNameEs: "Mago azul" },
  { id: "summoner", displayName: "Summoner", displayNameEs: "Invocador" }, { id: "bard", displayName: "Bard", displayNameEs: "Bardo" },
  { id: "dancer", displayName: "Dancer", displayNameEs: "Bailarín" }, { id: "beastmaster", displayName: "Beastmaster", displayNameEs: "Domador" },
];

export const CLASS_CATALOG = roster.map(({ id, displayName, displayNameEs, enabled = true, sprite }) => ({
  id, displayName, displayNames: { en: displayName, es: displayNameEs }, enabled, spriteKey: id,
  sprite: sprite ?? { path: `/img/level38/classes/${id}/idle.svg`, frameWidth: 32, frameHeight: 32, frames: 4, fps: 4, demo: true },
}));

export function randomClassId(): string {
  const pool = CLASS_CATALOG.filter((entry) => entry.enabled);
  if (!pool.length) throw new Error("The cosmetic class roster is empty.");
  return pool[randomInt(pool.length)].id;
}

export function publicClass(classId: string | null) {
  if (!classId) return null;
  const entry = CLASS_CATALOG.find((item) => item.id === classId);
  // An accidentally removed catalog entry must never reroll a persistent assignment.
  return entry ? { id: entry.id, displayName: entry.displayName, spriteKey: entry.spriteKey, sprite: entry.sprite }
    : { id: "adventurer", displayName: "Adventurer", spriteKey: "placeholder", sprite: null };
}
