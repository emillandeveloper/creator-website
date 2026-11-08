# 🐺 Leo Nifelheim — Stream Hub

Página web de creador con arquitectura **MVC** en **Node.js + Express + TypeScript** y vistas **EJS**. Estilo dark fantasy a juego con el calendario de stream.

## LEVEL 38

La base del evento de cumpleaños vive en `/level38`, con panel de control en `/level38/control`. Está desactivada por defecto y necesita PostgreSQL para activarse. Consulta [la guía de arquitectura, configuración y desarrollo de LEVEL 38](docs/level38.md).

## 📁 Estructura (MVC)

```
src/
├── models/data.ts          ← TODA tu info editable (perfil, horario, redes, juegos)
├── views/index.ejs         ← La plantilla HTML
├── controllers/            ← Lógica (qué datos van a la vista)
│   └── HomeController.ts
├── routes/index.ts         ← Rutas de la web
├── config/                 ← (reservado para configuración futura)
└── server.ts               ← Arranque del servidor Express
public/
├── css/style.css           ← Estilos dark fantasy
├── img/                     ← avatar.png, banner.png
│   └── logos/               ← ff9.png, p5r.png, bg3.png, zwei.png
└── js/
```

## 🚀 Cómo usar

### Instalar (solo la primera vez)
```bash
npm install
```

### Desarrollo (recarga automática)
```bash
npm run dev
```
Abre http://localhost:3000

### Producción
```bash
npm run build
npm start
```

## ✏️ Editar contenido

Todo el contenido está en `src/models/data.ts`. Edita ese único archivo para:
- Cambiar tu bio, avatar, banner (`PROFILE`)
- Actualizar el horario semanal (`SCHEDULE`)
- Añadir/quitar redes sociales (`SOCIALS`)
- Cambiar los juegos (`GAMES`): cada entrada necesita `type: "challenge"` para retos y randomizers, o `type: "playthrough"` para partidas normales.
- `status: "playing"` aparece en **Now Playing** y en **In progress / En curso** dentro de su categoría (**Challenges / Desafíos** o **Playthroughs / Partidas**).
- `status: "completed"` aparece en **Completed / Completados** dentro de su categoría. `status: "upcoming"` sigue reservado y no se muestra.

La categoría describe esa partida concreta: un mismo juego puede tener un playthrough y varios retos como entradas independientes.

### Fichas de desafíos y presentación

Las fichas viven en `/challenges/<slug>` y sus reglas, formato y resultado en `src/models/challenges.ts`. `gameTitle` enlaza cada ficha con su entrada en `GAMES`. Mantén el `slug` estable para conservar los enlaces compartidos. Solo se publican datos documentados, sin fechas, récords o vídeos inventados.

El About ampliado se edita en `PROFILE.about`, con un párrafo EN/ES por entrada. `PROFILE.bio` queda como resumen y descripción de la página. Los enlaces `/#challenges`, `/#playthroughs` y `/#about` abren directamente esas secciones y conservan el idioma al navegar.

### Directo y próxima emisión

La portada muestra el horario previsto desde el servidor, calculado en `Europe/Madrid`, incluido el cambio de hora. Durante la franja programada dice **Horario de hoy**: el reloj nunca activa **En directo**.

`/api/stream-status?lang=es` consulta el estado real del canal mediante Twitch Helix y lo actualiza en la página cada minuto. Reutiliza las variables existentes `TWITCH_CLIENT_ID` y `TWITCH_CLIENT_SECRET` exclusivamente en el servidor, con autorización de aplicación y caché de 60 segundos. Es independiente de LEVEL 38, EventSub y las encuestas, y no requiere nuevos permisos del broadcaster. `TWITCH_LIVE_ENABLED=false` permite desactivar esta consulta. Si faltan credenciales o Twitch falla, se mantiene el horario previsto y el enlace a Twitch, sin mostrar un estado LIVE antiguo ni errores internos.

El día actual se resalta automáticamente en el horario.

## 🖼️ Imágenes

Reemplaza los placeholders en `public/img/`:
- `avatar.png` — tu foto de perfil (cuadrada, ~300x300)
- `banner.png` — fondo del hero (~1200x500)
- `logos/*.png` — logos de juegos (fondo transparente)

## 🌐 Hosting

### Render

Para desplegar LEVEL 38 por primera vez, sigue la [lista de despliegue en producción](docs/render-deployment.md), con todas las variables de entorno, inicialización y comprobaciones.

La configuración propuesta usa una instancia Starter de pago y PostgreSQL de pago para el evento. Build: `npm ci --include=dev && npm run build`; pre-deploy: `npm run db:migrate` (`prisma migrate deploy`); start: `npm start`. Mantén LEVEL 38 desactivado hasta inicializar la base de datos y crear las claves de los operadores. Los despliegues automáticos quedan desactivados en la propuesta; debes revisar también el ajuste del servicio existente en Render.

### Railway
Similar a Render, también tiene plan gratuito.

> El plan gratuito de Render puede servir para probar la web de creador, pero no para un evento que necesita funcionamiento continuo y datos persistentes.
