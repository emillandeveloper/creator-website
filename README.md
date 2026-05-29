# 🐺 Leo Nifelheim — Stream Hub

Página web de creador con arquitectura **MVC** en **Node.js + Express + TypeScript** y vistas **EJS**. Estilo dark fantasy a juego con el calendario de stream.

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

## 🌐 Hosting gratuito

### Render (recomendado para Node)
1. Sube este repo a GitHub
2. En render.com → New → Web Service → conecta el repo
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Plan: Free

### Railway
Similar a Render, también tiene plan gratuito.

> Nota: el plan gratuito de Render "duerme" el servicio tras inactividad y tarda ~30s en revivir en la primera visita. Para una web de creador es suficiente.
