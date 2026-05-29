import express, { Application } from "express";
import path from "path";
import routes from "./routes";

const app: Application = express();
const PORT = process.env.PORT || 3000;

/* Motor de vistas EJS */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "src", "views"));

/* Archivos estáticos (css, js, imágenes) */
app.use(express.static(path.join(__dirname, "..", "public")));

/* Rutas */
app.use("/", routes);

app.listen(PORT, () => {
  console.log(`🐺  Leo Nifelheim site corriendo en http://localhost:${PORT}`);
});

export default app;
