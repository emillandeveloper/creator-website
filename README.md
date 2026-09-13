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
- Cambiar los juegos (`GAMES`): `status: "playing"` aparece en **Now Playing** y `status: "completed"` aparece en **Games**

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
