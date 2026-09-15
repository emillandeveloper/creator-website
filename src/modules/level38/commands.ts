import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashToken, newToken } from "./auth";
import { seedLevel38 } from "./seed";
import { updateStarterQuestContent } from "./quest-content-update";
import { backfillParticipantVariants } from "./variants";

async function main(): Promise<void> {
  const db = new PrismaClient();
  try {
    const [command, operation, name, role] = process.argv.slice(2);
    if (command === "participant-variants") {
      if ((operation && operation !== "--apply") || name || role) throw new Error("Usage: node dist/modules/level38/commands.js participant-variants [--apply]");
      console.log(JSON.stringify(await backfillParticipantVariants(db, operation === "--apply"), null, 2));
      return;
    }
    if (command === "quest-content") {
      if (operation && operation !== "--apply") throw new Error("Usage: node dist/modules/level38/commands.js quest-content [--apply]");
      console.log(JSON.stringify(await updateStarterQuestContent(db, operation === "--apply"), null, 2));
      return;
    }
    if (command === "seed") {
      console.log(await seedLevel38(db) ? "Created LEVEL 38 with 54 starter quests (6 secret)." : "LEVEL 38 already exists; no event data changed.");
      return;
    }
    if (command !== "operator" || !name || !/^[\p{L}\p{N}_ -]{2,32}$/u.test(name)) {
      throw new Error("Usage: npm run level38:operator -- create NAME MODERATOR|OWNER, rotate NAME, or disable NAME. Names must be 2–32 letters, digits, spaces, underscores or hyphens.");
    }
    if (operation === "create") {
      if (role !== "MODERATOR" && role !== "OWNER") throw new Error("Role must be MODERATOR or OWNER.");
      const key = newToken();
      await db.operator.create({ data: { name, role, keyHash: hashToken(key) } });
      console.log(`Created ${name} (${role}). Store this access key securely; it is shown only once:\n${key}`);
    } else if (operation === "rotate" || operation === "disable") {
      const key = newToken();
      await db.$transaction(async (tx) => {
        const operator = await tx.operator.update({ where: { name }, data: operation === "rotate" ? { keyHash: hashToken(key), disabled: false } : { disabled: true } });
        await tx.operatorSession.deleteMany({ where: { operatorId: operator.id } });
      });
      console.log(operation === "rotate" ? `Rotated ${name}; all sessions revoked. Store the new access key securely:\n${key}` : `Disabled ${name}; all sessions revoked.`);
    } else {
      throw new Error("Choose create, rotate, or disable.");
    }
  } finally { await db.$disconnect(); }
}

void main().catch((error: unknown) => {
  // Prisma errors can include connection strings; report a safe code instead of raw details.
  if (error instanceof Error && error.name.startsWith("Prisma")) console.error("Database command failed. Check the connection, migrations, and whether this operator already exists.");
  else console.error(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
});
