import express, { Application, ErrorRequestHandler, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import { Level38Auth } from "../modules/level38/auth";
import { readLevel38Config } from "../modules/level38/config";
import { Level38Error } from "../modules/level38/errors";
import { CatalogStore, catalogInput } from "./catalog";
import { catalogLogo } from "./catalog-logo";
import { ChaosStore } from "./chaos";

const wrap = (handler: (req: Request, res: Response) => Promise<void>): express.RequestHandler =>
  (req, res, next) => { handler(req, res).catch(next); };

export function mountCatalog(app: Application) {
  const configured = Boolean(process.env.DATABASE_URL && process.env.LEVEL38_ORIGIN);
  const db = configured ? new PrismaClient() : undefined;
  const store = new CatalogStore(db);
  const chaos = db ? new ChaosStore(db) : undefined;
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    next();
  });
  if (!db) {
    router.use((req, res) => {
      if (req.path.startsWith("/api/")) res.status(503).json({ error: "El catálogo no está configurado todavía." });
      else res.status(503).render("admin", { configured: false, authenticated: false });
    });
  } else {
    const config = readLevel38Config({ ...process.env, LEVEL38_ENABLED: "true" });
    app.set("trust proxy", config.trustProxyHops);
    const auth = new Level38Auth(db, config, { cookieName: "creator_admin", path: "/admin", ownerOnly: true });
    const limited = (limit: number, windowMs: number) => rateLimit({ limit, windowMs, standardHeaders: "draft-7", legacyHeaders: false,
      message: { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." } });
    router.use((req, _res, next) => {
      if (req.method !== "GET" && (req.get("Origin") !== config.origin || req.get("X-Catalog-Request") !== "1" || !req.is("application/json"))) {
        next(new Level38Error(403, "Utiliza el panel de esta web para guardar cambios."));
      } else next();
    });
    router.get("/", wrap(async (req, res) => {
      res.render("admin", { configured: true, authenticated: Boolean(await auth.operator(req)) });
    }));
    router.get("/chaos", wrap(async (req, res) => {
      if (!await auth.operator(req)) { res.redirect(302, "/admin"); return; }
      res.render("chaos-admin");
    }));
    router.post("/api/login", limited(10, 15 * 60 * 1000), express.json({ limit: "4kb", inflate: false }), wrap(async (req, res) => {
      try { await auth.login(req, res, req.body?.key); }
      catch (error) { if (error instanceof Level38Error && error.status === 401) throw new Level38Error(401, "La clave de propietario no es válida."); throw error; }
      res.json({ ok: true });
    }));
    router.post("/api/logout", express.json({ limit: "1kb", inflate: false }), wrap(async (req, res) => { await auth.logout(req, res); res.json({ ok: true }); }));
    router.use((req, res, next) => { auth.requireOwner(req).then(owner => { res.locals.owner = owner; next(); }).catch(next); });
    router.get("/api/chaos/state", wrap(async (_req, res) => { res.json(await chaos!.state()); }));
    router.post("/api/chaos/rewards/:id", limited(40, 60 * 1000), express.json({ limit: "2kb", inflate: false }), wrap(async (req, res) => {
      res.json(await chaos!.saveReward(req.params.id, req.body));
    }));
    router.post("/api/chaos/test/:id", limited(20, 60 * 1000), express.json({ limit: "1kb", inflate: false }), wrap(async (req, res) => {
      res.status(201).json({ event: await chaos!.simulate(req.params.id) });
    }));
    router.get("/api/games", wrap(async (_req, res) => { res.json({ games: await store.list() }); }));
    router.post(["/api/games", "/api/games/:id"], limited(30, 60 * 1000), express.json({ limit: "7mb", inflate: false }), wrap(async (req, res) => {
      const id = req.params.id;
      if (id && !/^[a-z0-9-]{1,120}$/.test(id)) throw new Level38Error(400, "El juego no es válido.");
      const input = catalogInput(req.body);
      const logo = await catalogLogo(req.body.logo);
      const game = await store.save(id, input, res.locals.owner.id, logo);
      res.status(id ? 200 : 201).json({ game });
    }));
  }
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    const status = error instanceof Level38Error ? error.status : error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" ? 400 : error?.type === "encoding.unsupported" ? 415 : 503;
    const message = error instanceof Level38Error ? (status === 401 && req.path !== "/api/login" ? "Tu sesión ha caducado. Vuelve a entrar al panel." : error.message) : status === 413 ? "El archivo es demasiado grande (máximo 5 MB)." : status === 400 ? "Revisa los datos del formulario." : "No se ha podido guardar o cargar el catálogo. Vuelve a intentarlo.";
    if (req.path.startsWith("/api/")) res.status(status).json({ error: message });
    else res.status(status).render("admin", { configured: false, authenticated: false });
  };
  router.use(errors);
  app.use("/admin", router);
  app.get("/chaos/overlay", (_req, res) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.render("chaos-overlay");
  });
  app.get("/chaos/api/latest", rateLimit({ windowMs: 60 * 1000, limit: 150, standardHeaders: "draft-7", legacyHeaders: false }), wrap(async (_req, res) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.json({ event: chaos ? await chaos.currentOverlay() : null });
  }));
  app.get("/media/catalog/:id", wrap(async (req, res) => {
    try {
      const logo = /^[a-z0-9-]{1,120}$/.test(req.params.id) ? await db?.catalogLogo.findUnique({ where: { gameId: req.params.id } }) : null;
      if (!logo) { res.sendStatus(404); return; }
      res.set({ "Content-Type": logo.mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=0, must-revalidate" });
      res.send(Buffer.from(logo.data));
    } catch { res.sendStatus(503); }
  }));
  return { store, ready: async () => {
    if (!db) return true;
    await db.catalogGame.findFirst({ select: { id: true } });
    await db.catalogLogo.findFirst({ select: { gameId: true } });
    await db.chaosReward.findFirst({ select: { id: true } });
    await db.chaosActivity.findFirst({ select: { id: true } });
    return true;
  }, close: async () => { await db?.$disconnect(); } };
}
