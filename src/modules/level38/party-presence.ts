import { randomUUID } from "crypto";

export interface PartyConfig { enabled: boolean; nameMode: string; maxVisible: number }
export interface PartyIdentity { id: string; nickname: string | null; classId: string | null; variantId: string | null; streamVisible: boolean; expiresAt: Date }
export interface PartyMember { presenceId: string; nickname: string; classId: string; variantId: string | null }
interface Entry { identity: PartyIdentity; member?: PartyMember; order?: number; connections: Map<string, number>; leaveAt?: number }
export interface PresenceStore {
  connect(socketId: string, identity: PartyIdentity): boolean;
  heartbeat(socketId: string): boolean;
  disconnect(socketId: string): void;
  update(identity: PartyIdentity): void;
  clear(): void;
  sweep(): void;
  members(): PartyMember[];
  target(participantId: string): string | undefined;
}

// Single-process implementation. IDs, expiry and connection clocks stay private to this store.
// A future shared adapter must preserve per-participant atomicity and stable join order.
export class MemoryPartyPresence implements PresenceStore {
  private entries = new Map<string, Entry>();
  private sockets = new Map<string, string>();
  private nextOrder = 0;
  constructor(private readonly emit: (event: string, payload: unknown) => void,
    private readonly now = Date.now, private readonly graceMs = 45000, private readonly staleMs = 60000) {}

  private reconcile(entry: Entry) {
    const p = entry.identity;
    const eligible = p.streamVisible && p.nickname && p.classId && p.expiresAt.getTime() > this.now();
    if (!eligible) {
      if (entry.member) this.emit("party:left", { presenceId: entry.member.presenceId });
      entry.member = undefined; return;
    }
    const member = { presenceId: entry.member?.presenceId ?? randomUUID(), nickname: p.nickname!, classId: p.classId!, variantId: p.variantId };
    if (!entry.member) { entry.member = member; entry.order = ++this.nextOrder; this.emit("party:joined", member); }
    else if (JSON.stringify(member) !== JSON.stringify(entry.member)) { entry.member = member; this.emit("party:updated", member); }
  }
  connect(socketId: string, identity: PartyIdentity): boolean {
    if (!identity.nickname || !identity.classId || identity.expiresAt.getTime() <= this.now()) return false;
    if (this.sockets.has(socketId) && this.sockets.get(socketId) !== identity.id) this.disconnect(socketId);
    let entry = this.entries.get(identity.id);
    if (!entry) { entry = { identity, connections: new Map() }; this.entries.set(identity.id, entry); }
    entry.identity = identity; entry.leaveAt = undefined;
    entry.connections.set(socketId, this.now()); this.sockets.set(socketId, identity.id);
    this.reconcile(entry); return true;
  }
  heartbeat(socketId: string): boolean {
    const id = this.sockets.get(socketId), entry = id ? this.entries.get(id) : undefined;
    if (!entry || entry.identity.expiresAt.getTime() <= this.now()) return false;
    entry.connections.set(socketId, this.now()); return true;
  }
  disconnect(socketId: string) {
    const id = this.sockets.get(socketId); this.sockets.delete(socketId);
    const entry = id ? this.entries.get(id) : undefined;
    if (!entry) return;
    entry.connections.delete(socketId);
    if (!entry.connections.size) entry.leaveAt = this.now() + this.graceMs;
  }
  update(identity: PartyIdentity) {
    const entry = this.entries.get(identity.id);
    if (!entry) return;
    entry.identity = identity;
    if (!identity.nickname || !identity.classId || identity.expiresAt.getTime() <= this.now()) this.remove(identity.id, entry);
    else this.reconcile(entry);
  }
  private remove(id: string, entry: Entry) {
    if (entry.member) this.emit("party:left", { presenceId: entry.member.presenceId });
    for (const socket of entry.connections.keys()) this.sockets.delete(socket);
    this.entries.delete(id);
  }
  clear() { for (const [id, entry] of this.entries) this.remove(id, entry); }
  sweep() {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      for (const [socket, seen] of entry.connections) if (now - seen >= this.staleMs) {
        entry.connections.delete(socket); this.sockets.delete(socket);
        if (!entry.connections.size) entry.leaveAt = now;
      }
      if (entry.identity.expiresAt.getTime() <= now || (entry.leaveAt !== undefined && now >= entry.leaveAt)) this.remove(id, entry);
    }
  }
  members(): PartyMember[] { return [...this.entries.values()].filter(entry => entry.member).sort((a, b) => a.order! - b.order!).map(entry => ({ ...entry.member! })); }
  target(participantId: string) { return this.entries.get(participantId)?.member?.presenceId; }
}
