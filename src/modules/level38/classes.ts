import { randomInt } from "crypto";

// Stable IDs are persisted; names and asset metadata are resolved here, never on participants.
// Retain retired entries with enabled: false so existing assignments still display correctly.
interface Sprite { path: string; frameWidth: number; frameHeight: number; frames: number; fps: number; demo: boolean }
interface ClassDefinition { id: string; displayName: string; enabled?: boolean; sprite?: Sprite }
// Optional enabled/sprite fields override the defaults on any individual entry.
const roster: ClassDefinition[] = [
  { id: "knight", displayName: "Knight" }, { id: "dark-knight", displayName: "Dark Knight" },
  { id: "dragoon", displayName: "Dragoon" }, { id: "monk", displayName: "Monk" },
  { id: "thief", displayName: "Thief" }, { id: "ninja", displayName: "Ninja" },
  { id: "samurai", displayName: "Samurai" }, { id: "ranger", displayName: "Ranger" },
  { id: "black-mage", displayName: "Black Mage" }, { id: "white-mage", displayName: "White Mage" },
  { id: "red-mage", displayName: "Red Mage" }, { id: "blue-mage", displayName: "Blue Mage" },
  { id: "summoner", displayName: "Summoner" }, { id: "bard", displayName: "Bard" },
  { id: "dancer", displayName: "Dancer" }, { id: "beastmaster", displayName: "Beastmaster" },
];

export const CLASS_CATALOG = roster.map(({ id, displayName, enabled = true, sprite }) => ({
  id, displayName, enabled, spriteKey: id,
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
