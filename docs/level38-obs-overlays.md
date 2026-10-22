# LEVEL 38 — Overlays de votación y misión activa

Los dos overlays reutilizan el catálogo, las votaciones, los permisos y Socket.IO de LEVEL 38. Son páginas públicas de lectura: OBS no necesita una cuenta, una clave ni una sesión de operador.

## Rutas para OBS

| Fuente | Español | Inglés |
| --- | --- | --- |
| Votación | `/level38/overlay/poll?lang=es` | `/level38/overlay/poll?lang=en` |
| Misión activa | `/level38/overlay/quest?lang=es` | `/level38/overlay/quest?lang=en` |

El idioma predeterminado es español. Los parámetros no reconocidos no ejecutan acciones. Después de un despliegue autorizado, las URL completas serán `https://leonifelheim.tv/level38/overlay/poll?lang=es` y `https://leonifelheim.tv/level38/overlay/quest?lang=es`.

En OBS, añade dos fuentes **Navegador / Browser Source** independientes, con archivo local desactivado, anchura **1920** y altura **1080**. La página proporciona el fondo transparente; no hace falta CSS personalizado. Coloca ambas por encima del juego. A esa resolución, la votación ocupa la zona superior izquierda y la misión la superior derecha, dejando libre la franja inferior del overlay de party existente. Puedes cambiar el tamaño, recorte y posición de cada fuente desde OBS.

Cuando no hay contenido que anunciar, la página permanece completamente transparente. Recargar la fuente o volver a conectar Socket.IO recupera el estado persistido. No es necesario activar «Actualizar al activar la escena»: esa opción puede usarse si se prefiere, pero no reinicia la votación. Las dimensiones inferiores se adaptan al espacio disponible; al combinarlas, coloca cada fuente de forma independiente para evitar que se solapen.

## Operación desde el panel

OWNER y MODERATOR mantienen sus permisos habituales en `/level38/control`.

1. Crea una encuesta de tipo `NEXT_QUEST`, `NEXT_GAME`, `YES_NO` o `CUSTOM`. En `NEXT_GAME` puedes elegir un contexto de misión con al menos dos juegos elegibles habilitados o una elección global.
2. Ajusta **Duración** antes de iniciarla: el valor inicial es **60 segundos**; Twitch admite enteros entre **15 y 1800** segundos. La pregunta admite hasta **60 caracteres** y se permiten **2–5 opciones** de hasta **25 caracteres**. Las referencias largas se abrevian conservando sus IDs internos.
3. Guarda el borrador e inicia la votación manualmente. El servidor crea la encuesta nativa en Twitch; el overlay aparece cuando Twitch confirma que está abierta.
4. Los espectadores votan en Twitch. El panel permite cerrar anticipadamente o cancelar; ambos comandos se sincronizan con Twitch.

Helix no permite ampliar una encuesta activa: ajusta la duración en el borrador o prepara otra ronda. Los controles conservan la validación de origen, sesión administrativa y revisión optimista; una acción concurrente requiere revisar el estado más reciente. Los votos web históricos se conservan de solo lectura y no se mezclan con los totales de Twitch.

Al llegar a cero, el overlay espera el resultado definitivo de EventSub o Helix. Si existe un único líder con al menos un voto y sus referencias siguen siendo elegibles, se registra mediante las reglas actuales. Un empate, una encuesta sin votos o una elección que ya no puede aplicarse queda pendiente de decisión del operador; no se sortea un resultado ni se atribuyen votos. Las elecciones manuales, las justificaciones de override y la activación manual de misiones siguen disponibles.

El cierre anticipado envía `TERMINATED` a Twitch y espera sus totales finales. **Cancelar** una encuesta activa envía `ARCHIVED`, conserva sus votos e historial y la oculta sin anunciar ganador. Una encuesta cancelada no admite aceptar un resultado.

El resultado final aparece durante aproximadamente **10 segundos** desde su confirmación. Recargar OBS dentro de ese intervalo muestra únicamente el tiempo que queda; no vuelve a empezar el anuncio. Una ronda abierta tiene prioridad sobre anuncios anteriores. El overlay muestra los **cuatro tipos**, incluidos empates y encuestas sin votos, sin proclamar ganadores provisionales.

## Misión activa

El overlay muestra número, título traducido, juego seleccionado para esa misión y objetivo. No requiere que se haya creado una votación. Si existen varias misiones activas, el servidor elige de forma determinista la que se modificó más recientemente y usa el ID como desempate, sin alterar los estados de las demás.

Una misión completada muestra una animación breve de **QUEST COMPLETE!** —traducida en español— durante aproximadamente **4 segundos**. Después aparece la misión activa que corresponda o se oculta la fuente. El tiempo se calcula a partir de `completedAt` y la hora del servidor, por lo que una recarga no repite celebraciones antiguas. Fallar, omitir o devolver una misión al estado disponible actualiza la fuente mediante Socket.IO.

Los seis secretos no revelados permanecen ocultos en HTML, API y mensajes públicos. Los overlays consumen las proyecciones públicas redactadas, incluidos `overlayActiveQuest` y `overlayQuestCompletion`; nunca leen el estado administrativo. El catálogo mantiene sus **60 misiones**, la #43 de **Final Fantasy VII Remake Intergrade** y la meta de **38 completadas**.

## Persistencia y concurrencia

La autoridad de los votos y plazos es Twitch. El servidor persiste su proyección; el navegador presenta una cuenta atrás a partir de `serverTime` y `endsAt`, usando su reloj monotónico solo para interpolar. No acepta votos ni decide quién gana.

EventSub actualiza los totales absolutos de inicio, progreso y finalización. Los IDs de mensajes y opciones evitan duplicados; un respaldo independiente consulta Helix cada cinco segundos mientras la encuesta está abierta, incluso si falla la autorización de aplicación o EventSub. Los votos, porcentajes y barras se publican por Socket.IO antes del cierre. El reloj local no confirma resultados. Las transacciones del evento serializan controles y proyecciones, y los resultados y fechas sobreviven a reinicios del proceso. Configuración, diagnóstico y comprobación real: [encuestas nativas](level38-native-twitch-polls.txt).

Los overlays escuchan el canal público existente. No registran participantes ni avatares de party, y no llaman a rutas administrativas. Al reconectar reciben una instantánea nueva; una consulta pública de respaldo se utiliza solo si esa instantánea no llega. El overlay de party conserva su diseño y su ciclo de presencia. El despliegue habitual sigue siendo de una sola instancia; probar la exclusión de cierres en PostgreSQL no introduce un adaptador de Socket.IO ni presencia compartida entre servidores.

## Migración necesaria

`prisma/migrations/202610210012_level38_obs_overlays/migration.sql` añade a `Poll`:

| Columna | Uso |
| --- | --- |
| `durationSeconds` | Duración configurada; predeterminada a 60, rango 1–3600. |
| `endsAt` | Fecha de cierre del servidor. |
| `cancelledAt` | Fecha de cancelación, si procede. |
| `closeReason` | `MANUAL`, `TIMEOUT`, `CANCELLED` o `null`. |

Se reutiliza `winnerAcceptedAt`, que ya existía, y se añade un índice por evento, estado y fecha. Las rondas ya abiertas reciben `openedAt + 60 segundos` (o la hora de migración si no tenían `openedAt`). Al arrancar la aplicación, una fecha vencida se resuelve una vez. Las rondas cerradas, votos, participantes, misiones, operadores y auditorías se conservan.

No hace falta sincronizar de nuevo el catálogo, sembrar datos ni reiniciar el evento. No usar `prisma migrate reset`, `db push` ni borrado de tablas. La migración se ejecuta con el procedimiento existente `npm run db:migrate` antes de iniciar la nueva aplicación, únicamente cuando se autorice su despliegue.

## Pruebas locales

Las pruebas crean esquemas aleatorios aislados en una base PostgreSQL desechable cuyo nombre contiene `test`. Nunca deben apuntar a producción.

El servidor PostgreSQL de la URL de ejemplo debe estar en marcha; cambia la URL si usas otro entorno local.

```powershell
$env:LEVEL38_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55441/level38_overlays_test'
npm run build
node --test --test-concurrency=1 tests/integration/overlays.test.cjs
node --test tests/visual/level38-overlays.cjs
```

La prueba visual utiliza el Chrome instalado y el Playwright local ya utilizado por las pruebas del proyecto. Guarda capturas transparentes y un informe en `dist/level38-overlays-visual-qa/`, un directorio ignorado por Git.

La cobertura incluye migración sin pérdida de datos; duración predeterminada y personalizada; ampliación y validación; votos y Socket.IO; ganador único; empate y cero votos; cancelación y cierre anticipado; vencimiento sin esperar al temporizador original; reinicio del proceso y carrera entre dos procesos; privacidad de las seis secretas; cambios y finalización de misión; #43 intacta; transparencia, ES/EN y funcionamiento simultáneo con party. Las capturas comprueban 1920×1080 y tamaños inferiores. Esta validación se realiza en Chrome: la colocación final y el rendimiento de OBS deben comprobarse en la escena real.

Esta fase se implementa y prueba localmente. No autoriza push, deploy ni cambios en la base de producción.

Validación del 21 de octubre de 2026: compilación y validación del catálogo correctas; 50 pruebas unitarias (45 existentes y 5 del temporizador), 73 de integración (65 existentes y 8 nuevas) y 4 pruebas de Chrome aprobadas. La primera ronda de integración detectó un fixture antiguo que aplicaba la migración de plazos antes de la que crea `archivedAt`; se corrigió el orden de ese fixture y su repetición pasó. Las otras 64 regresiones ya habían pasado. Las pruebas visuales incluyen los nuevos overlays, el catálogo y los dos escenarios previos de party, incluido rendimiento y limpieza con 30 avatares. La comprobación adicional de densidad con 8 opciones largas y pregunta de 160 caracteres deja el panel por debajo de 900 px en los cuatro casos ES/EN.
