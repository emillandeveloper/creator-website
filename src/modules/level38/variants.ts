import { Prisma, PrismaClient } from "@prisma/client";
import { CLASS_CATALOG, randomVariantId } from "./classes";

// Caller owns the transaction. The predicate protects both identity and any winner.
export async function assignMissingVariant(tx: Prisma.TransactionClient, id: string, classId: string) {
  const variantId = randomVariantId(classId);
  if (!variantId) return 0;
  return (await tx.participant.updateMany({ where: { id, classId, variantId: null }, data: { variantId } })).count;
}

export async function backfillParticipantVariants(db: PrismaClient, apply = false) {
  const report = { mode: apply ? "apply" : "dry-run", eligible: 0, assigned: 0, unknownClass: 0, alreadyAssigned: 0 };
  report.alreadyAssigned = await db.participant.count({ where: { variantId: { not: null } } });
  // Bounded pages; each row is a short transaction, safe to resume after interruption.
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.participant.findMany({ where: { classId: { not: null }, variantId: null },
      orderBy: { id: "asc" }, take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, classId: true } });
    if (!rows.length) break;
    for (const row of rows) {
      if (!CLASS_CATALOG.some(entry => entry.id === row.classId)) { report.unknownClass++; continue; }
      report.eligible++;
      if (apply) report.assigned += await db.$transaction(tx => assignMissingVariant(tx, row.id, row.classId!));
    }
    cursor = rows[rows.length - 1].id;
  }
  return report;
}
