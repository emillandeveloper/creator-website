import { Request } from "express";
import { PrismaClient } from "@prisma/client";
import { Namespace } from "socket.io";
import { Level38Auth } from "./auth";
import { MemoryPartyPresence, PartyConfig } from "./party-presence";
import { Level38State, PublicChange } from "./service";

export class PartyRuntime {
  readonly presence: MemoryPartyPresence;
  private config: PartyConfig = { enabled: true, nameMode: "ENTRY", maxVisible: 30 };
  private revision = -1;
  private epoch = 0;
  private reads = new Map<string, symbol>();
  private timer: ReturnType<typeof setInterval>;
  constructor(private readonly channel: Namespace, private readonly db: PrismaClient, auth: Level38Auth,
    private readonly state: () => Promise<Level38State>, origin: string) {
    this.presence = new MemoryPartyPresence((event, payload) => channel.to("overlay").emit(event, payload));
    this.timer = setInterval(() => this.presence.sweep(), 5000); this.timer.unref();
    channel.on("connection", socket => {
      const viewer = socket.handshake.auth?.kind === "viewer";
      // Overlay sockets receive only this namespace's presentation projection, never game state.
      if (!viewer) {
        void this.state().then(state => {
          if (!socket.connected) return;
          this.configure(state); socket.join("overlay"); socket.emit("party:snapshot", this.snapshot());
        }).catch(() => socket.disconnect());
        return;
      }
      let pending = false, lastRegister = -Infinity;
      socket.on("party:register", async (_untrusted: unknown, ack?: (value: { registered: boolean }) => void) => {
        // HTTP Origin protects cookie-authenticated presence as well as normal controls.
        if (socket.handshake.headers.origin !== origin || pending || Date.now() - lastRegister < 1000) return;
        pending = true; lastRegister = Date.now(); const epoch = this.epoch;
        try {
          const participant = await auth.viewer(socket.request as Request);
          const registered = !!participant && epoch === this.epoch && socket.connected && this.presence.connect(socket.id, participant);
          if (typeof ack === "function") ack({ registered });
        } catch { if (typeof ack === "function") ack({ registered: false }); }
        finally { pending = false; }
      });
      socket.on("party:heartbeat", (_untrusted: unknown, ack?: (value: { registered: boolean }) => void) => {
        const registered = this.presence.heartbeat(socket.id);
        if (typeof ack === "function") ack({ registered });
      });
      socket.on("party:leave", () => this.presence.disconnect(socket.id));
      socket.on("disconnect", () => this.presence.disconnect(socket.id));
    });
  }
  private configure(state: Level38State) {
    if (state.event.revision <= this.revision) return;
    this.revision = state.event.revision;
    if (JSON.stringify(this.config) !== JSON.stringify(state.party)) {
      this.config = { ...state.party }; this.channel.to("overlay").emit("party:config", this.config);
    }
  }
  snapshot() { return { members: this.presence.members(), config: { ...this.config } }; }
  counts() {
    const online = this.presence.members().length, rendered = this.config.enabled ? Math.min(online, this.config.maxVisible) : 0;
    return { online, rendered, overflow: this.config.enabled ? Math.max(0, online - rendered) : 0 };
  }
  async refreshParticipant(id: string) {
    ++this.epoch;
    const read = Symbol(); this.reads.set(id, read);
    try {
      const participant = await this.db.participant.findUnique({ where: { id } });
      // A reset or a newer read of THIS participant must win; unrelated viewers don't block updates.
      if (participant && this.reads.get(id) === read) this.presence.update(participant);
    } finally { if (this.reads.get(id) === read) this.reads.delete(id); }
  }
  vote(id: string) {
    const presenceId = this.presence.target(id);
    if (presenceId && this.config.enabled) this.channel.to("overlay").emit("party:action", { presenceId, action: "vote" });
  }
  publish(state: Level38State, change: PublicChange) {
    this.configure(state);
    if (["owner:participants", "owner:prepare"].includes(change.type)) { this.epoch++; this.reads.clear(); this.presence.clear(); }
    if (this.config.enabled) {
      if (change.unlock) this.channel.to("overlay").emit("level38:unlocked", change.unlock);
      else if (change.type === "quest:completed") this.channel.to("overlay").emit("party:action", { action: "quest" });
    }
  }
  close() { clearInterval(this.timer); this.epoch++; this.reads.clear(); this.presence.clear(); }
}
