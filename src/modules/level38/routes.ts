import express, { ErrorRequestHandler, Request, Response, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { Level38Config } from "./config";
import { Level38Controller } from "./controller";
import { Level38Error } from "./errors";

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): express.RequestHandler => (req, res, next) => { handler(req, res).catch(next); };

export function createLevel38Routes(controller: Level38Controller, config: Level38Config): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
      "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${config.origin.replace(/^http/, "ws")}; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    });
    next();
  });
  router.use((req, _res, next) => {
    if (req.method === "POST" && (req.get("origin") !== config.origin || req.get("X-Level38-Request") !== "1" || !req.is("application/json"))) {
      next(new Level38Error(403, "Use the LEVEL 38 page on the configured site to make changes."));
      return;
    }
    next();
  });
  router.use(express.json({ limit: "4kb" }));
  const limited = (limit: number, windowMs: number) => rateLimit({
    windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
  router.get("/", wrap(controller.publicPage));
  router.get("/control", wrap(controller.controlPage));
  router.get("/api/state", wrap(controller.publicState));
  router.get("/api/session", limited(300, 60 * 60 * 1000), wrap(controller.session));
  router.post("/api/join", limited(20, 60 * 1000), wrap(controller.join));
  router.post("/api/control/login", limited(10, 15 * 60 * 1000), wrap(controller.login));
  router.post("/api/control/logout", wrap(controller.logout));
  router.get("/api/control/state", wrap(controller.controlState));
  router.post("/api/control/quests/:id", limited(60, 60 * 1000), wrap(controller.changeQuest));
  router.post("/api/control/game", limited(30, 60 * 1000), wrap(controller.changeGame));
  router.post("/api/control/polls", limited(30, 60 * 1000), wrap(controller.savePoll));
  router.post("/api/control/polls/:id/edit", limited(60, 60 * 1000), wrap(controller.savePoll));
  router.post("/api/control/polls/:id/status", limited(60, 60 * 1000), wrap(controller.changePoll));
  router.post("/api/control/polls/:id/winner", limited(30, 60 * 1000), wrap(controller.selectWinner));
  router.post("/api/control/undo", limited(60, 60 * 1000), wrap(controller.undo));
  router.post("/api/polls/:id/vote", limited(120, 60 * 1000), wrap(controller.vote));
  router.post("/api/owner/games/:id", limited(30, 60 * 1000), wrap(controller.configureGame));
  router.use((_req, _res, next) => next(new Level38Error(404, "LEVEL 38 route not found.")));
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    const bodyError = error as { type?: string } | null;
    const status = error instanceof Level38Error ? error.status : bodyError?.type === "entity.too.large" ? 413 : bodyError?.type === "entity.parse.failed" ? 400 : 503;
    const message = error instanceof Level38Error ? error.message : status === 400 ? "Invalid JSON body." : status === 413 ? "Request body is too large." : "LEVEL 38 is temporarily unavailable. Please try again shortly.";
    // Database errors can contain connection details; keep responses and routine logs credential-free.
    if (status === 503) console.error("LEVEL 38 request unavailable.");
    if (req.path.startsWith("/api/")) res.status(status).json({ error: message });
    else res.status(status).render("level38/unavailable", { message });
  };
  router.use(errors);
  return router;
}
