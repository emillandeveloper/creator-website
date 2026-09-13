import { PrismaClient } from "@prisma/client";
import { randomClassId } from "./classes";
import { Level38Error } from "./errors";

export async function joinParticipant(db: PrismaClient, id: string, name?: string) {
  return db.$transaction(async (tx) => {
    if (name !== undefined) {
      // Updating this row serializes concurrent nickname changes and first assignments.
      const changed = await tx.participant.updateMany({ where: { id, expiresAt: { gt: new Date() } }, data: { nickname: name } });
      if (changed.count !== 1) throw new Level38Error(401, "Your viewer session expired. Reload to join again.");
    }
    // Compare-and-set also protects two concurrent lazy backfills from rerolling.
    const assigned = await tx.participant.updateMany({
      where: { id, classId: null, nickname: { not: null }, expiresAt: { gt: new Date() } },
      data: { classId: randomClassId() },
    });
    const participant = await tx.participant.findFirst({ where: { id, expiresAt: { gt: new Date() } } });
    if (!participant) throw new Level38Error(401, "Your viewer session expired. Reload to join again.");
    return { participant, classAssigned: assigned.count === 1 };
  });
}
