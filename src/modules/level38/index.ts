import { Application } from "express";
import { Server as HttpServer } from "http";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";
import { Level38Auth } from "./auth";
import { Level38Config } from "./config";
import { Level38Controller } from "./controller";
import { createLevel38Routes } from "./routes";
import { EVENT_SLUG, Level38Service, Level38State } from "./service";
import { UnlockEvent } from "./celebration";
import { readTwitchConfig } from "./twitch/config";
import { TwitchApi } from "./twitch/api";
import { TwitchStore, Publisher } from "./twitch/store";
import { TwitchIntegration } from "./twitch/integration";

const domainEvents = ["quest:activated", "quest:completed", "quest:failed", "quest:skipped", "quest:revealed", "quest:available", "poll:created", "poll:edited", "poll:opened", "poll:vote-updated", "poll:closed", "poll:winner", "game:changed", "game:configured", "action:undone"] as const;
type DomainEvent = typeof domainEvents[number];
type ServerEvents = Record<DomainEvent, (event: { revision: number }) => void> & {
  "level38:state": (state: Level38State) => void;
  "level38:unavailable": () => void;
  "level38:unlocked": (event: UnlockEvent) => void;
}

export function mountLevel38(app: Application, server: HttpServer, config: Level38Config) {
  if (!config.enabled) {
    app.use("/level38", (req, res) => {
      const message = "LEVEL 38 is being prepared. Please check back soon.";
      if (req.path.startsWith("/api/")) res.status(503).json({ error: message });
      else res.status(503).render("level38/unavailable", { message });
    });
    return { ready: async (): Promise<boolean> => true, close: async (): Promise<void> => {} };
  }
  app.set("trust proxy", config.trustProxyHops);
  const db = new PrismaClient();
  const io = new Server<Record<string, never>, ServerEvents>(server, {
    path: "/level38/socket.io", maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => callback(null, !req.headers.origin || req.headers.origin === config.origin),
  });
  const channel = io.of("/level38");
  const publish: Publisher = (state, change) => {
    channel.emit("level38:state", state);
    // Domain notifications contain no entity metadata or operator information.
    if (domainEvents.includes(change.type as DomainEvent)) channel.emit(change.type as DomainEvent, { revision: change.revision });
    if (change.unlock) channel.emit("level38:unlocked", change.unlock);
  };
  const service = new Level38Service(db, publish);
  const twitchConfig = readTwitchConfig();
  const twitch = new TwitchIntegration(twitchConfig, new TwitchApi(twitchConfig), new TwitchStore(db, publish));
  channel.on("connection", (socket) => {
    service.state().then((state) => socket.emit("level38:state", state)).catch(() => socket.emit("level38:unavailable"));
  });
  const controller = new Level38Controller(db, new Level38Auth(db, config), service, twitch);
  app.use("/level38", createLevel38Routes(controller, config, twitch));
  server.once("listening", () => twitch.start());
  return { ready: async (): Promise<boolean> => {
    // A small, read-only readiness query: migrations and seed must precede enablement.
    // The Phase 2 column also rejects a database still on the foundation schema.
    return await db.event.findUnique({
      where: { slug: EVENT_SLUG }, select: { id: true, controlRevision: true },
    }) !== null;
  }, close: async (): Promise<void> => {
    await twitch.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await db.$disconnect();
  } };
}
