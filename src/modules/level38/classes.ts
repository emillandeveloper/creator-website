import { randomInt } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

interface Variant { variantId: string }
interface ClassDefinition { classId: string; displayNames: { en: string; es: string }; enabled: boolean; variants: Variant[] }
export const SPRITE_MANIFEST = JSON.parse(readFileSync(resolve(__dirname, "../../../public/level38/classes/manifest.json"), "utf8")) as {
  version: string; classes: ClassDefinition[];
};
// Browser clients load this same resolver. Never construct paths from participant IDs.
const sprites = require(resolve(__dirname, "../../../public/js/level38/sprites.js"));
export const CLASS_CATALOG = SPRITE_MANIFEST.classes.map(entry => ({ ...entry, id: entry.classId, displayName: entry.displayNames.en }));
export function randomClassId(pick: (maximum: number) => number = randomInt): string {
  const pool = CLASS_CATALOG.filter(entry => entry.enabled);
  if (!pool.length) throw new Error("The cosmetic class roster is empty.");
  return pool[pick(pool.length)].id;
}
export function randomVariantId(classId: string, pick: (maximum: number) => number = randomInt): string | null {
  const variants = CLASS_CATALOG.find(entry => entry.id === classId)?.variants;
  return variants?.length ? variants[pick(variants.length)].variantId : null;
}
export function publicClass(classId: string | null, variantId: string | null = null) {
  return classId ? sprites.resolve(SPRITE_MANIFEST, classId, variantId) : null;
}
