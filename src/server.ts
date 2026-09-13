import "dotenv/config";
import express, { Application } from "express";
import { createServer } from "http";
import path from "path";
import routes from "./routes";
import { mountLevel38 } from "./modules/level38";
import { readLevel38Config } from "./modules/level38/config";

const app: Application = express();
const PORT = process.env.PORT || 3000;

/* Motor de vistas EJS */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "src", "views"));

/* Archivos estáticos (css, js, imágenes) */
app.use(express.static(path.join(__dirname, "..", "public")));

/* Rutas */
app.use("/", routes);

const server = createServer(app);
const level38 = mountLevel38(app, server, readLevel38Config());

app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  void level38.ready().then((ready) => {
    res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable" });
  }).catch(() => {
    // Health checks must not disclose database errors, credentials, or event data.
    res.status(503).json({ status: "unavailable" });
  });
});

server.listen(PORT, () => {
  console.log(`🐺  Leo Nifelheim site corriendo en http://localhost:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    void level38.close().then(() => {
      server.close(() => { clearTimeout(deadline); process.exit(0); });
    }).catch(() => process.exit(1));
  });
}

export default app;
