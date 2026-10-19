import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { hashToken, newToken } from "./auth";
import { seedLevel38 } from "./seed";
import { syncQuestCatalog } from "./quest-content-update";
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
    if (command === "quest-content" || command === "quest-catalog") {
      const args = process.argv.slice(3);
      const usage = "Usage: node dist/modules/level38/commands.js quest-catalog [--dry-run|--apply] [--reviewed-history FILE]";
      let mode: string | undefined, reviewFile: string | undefined;
      for (let i = 0; i < args.length; i++) {
        const argument = args[i];
        if (["--apply", "--dry-run"].includes(argument) && !mode) mode = argument;
        else if (argument === "--reviewed-history" && !reviewFile && args[i + 1] && !args[i + 1].startsWith("--")) reviewFile = args[++i];
        else throw new Error(usage);
      }
      const review = reviewFile ? JSON.parse(readFileSync(reviewFile, "utf8")) : undefined;
      console.log(JSON.stringify(await syncQuestCatalog(db, mode === "--apply", review), null, 2));
      return;
    }
    if (command === "seed") {
      console.log(await seedLevel38(db) ? "Created LEVEL 38 with 60 final quests (6 secret)." : "LEVEL 38 already exists; no event data changed.");
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
