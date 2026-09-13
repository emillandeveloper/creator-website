import { Quest, QuestStatus } from "@prisma/client";
import { Level38Error } from "./errors";
import { QuestAction } from "./validation";

export function isHidden(quest: Pick<Quest, "status" | "isSecret" | "revealedAt">): boolean {
  return quest.status === "SECRET" || (quest.isSecret && quest.revealedAt === null);
}

export function allowedQuestActions(quest: Pick<Quest, "status" | "isSecret" | "revealedAt">): QuestAction[] {
  if (isHidden(quest)) return ["reveal"];
  switch (quest.status) {
    case "LOCKED": return ["available"];
    case "AVAILABLE": return ["activate", "skip"];
    case "ACTIVE": return ["complete", "fail", "skip", "available"];
    default: return [];
  }
}

export function questTransition(quest: Quest, action: QuestAction): QuestStatus {
  if (!allowedQuestActions(quest).includes(action)) {
    throw new Level38Error(409, `Cannot ${action} a ${isHidden(quest) ? "secret" : quest.status.toLowerCase()} quest.`);
  }
  return { activate: "ACTIVE", complete: "COMPLETED", fail: "FAILED", skip: "SKIPPED", reveal: "AVAILABLE", available: "AVAILABLE" }[action] as QuestStatus;
}

export function questSnapshot(quest: Quest) {
  return { title: quest.title, number: quest.number, status: quest.status, isSecret: quest.isSecret,
    revealedAt: quest.revealedAt?.toISOString() ?? null, completedAt: quest.completedAt?.toISOString() ?? null };
}
