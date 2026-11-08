# Catálogo de creador

## Uso

- Abre `/admin` y entra con la clave existente de **OWNER** de LEVEL 38. Las claves de moderador no permiten administrar el catálogo.
- Usa **Añadir** o selecciona un juego existente. Nombre, tipo, estado, logo y al menos una descripción son necesarios para un juego nuevo.
- Las descripciones aceptan español e inglés. Un idioma vacío utiliza el texto del otro. No se realiza traducción automática.
- Los logos admiten PNG, JPG y WebP estáticos de hasta 5 MB / 20 megapíxeles. Se normalizan a WebP con transparencia y un máximo de 1600 × 900, manteniendo la proporción.
- Para conservar un logo al editar, deja el selector de archivo vacío. Puedes ajustar tamaño y contorno.
- Los desafíos tienen campos opcionales para formato, reglas (una por línea) y resultado/progreso. Las fichas y sus URL permanecen estables al cambiar el nombre.
- **Oculto / próximamente** conserva el registro sin mostrarlo en la web. No hay borrado permanente desde el panel.
- Guardar publica los cambios en el catálogo; no modifica el horario semanal.

## Persistencia y despliegue

Se reutilizan `DATABASE_URL`, `LEVEL38_ORIGIN`, `LEVEL38_TRUST_PROXY_HOPS` y las cuentas OWNER existentes. El panel funciona incluso con `LEVEL38_ENABLED=false`, siempre que la base de datos y el origen estén configurados. No se crean claves nuevas ni se cambia el acceso al evento.

Aplica `npm run db:migrate` antes de desplegar el código. La migración `202611080014_creator_catalog` añade únicamente `CatalogGame` y `CatalogLogo`; no modifica registros del evento. Render ya debe ejecutar las migraciones en pre-deploy, como en las versiones anteriores.

Los juegos originales de `src/models/data.ts` y sus fichas de `src/models/challenges.ts` son valores iniciales. Una edición del panel crea una versión persistente que prevalece sobre ese valor inicial. Las publicaciones de código nunca sobrescriben estas ediciones. Los logos subidos se guardan en PostgreSQL, no en el disco efímero del servidor. Se incluyen en las copias de seguridad de esa base de datos.

Para cambios posteriores solicitados a un asistente, utiliza el mismo panel con una sesión de propietario autorizada. No cambies únicamente `data.ts` si el juego ya tiene una edición persistente. El identificador del juego y su `revision` permiten detectar cambios simultáneos (respuesta 409) sin sobrescribirlos.

El admin usa una sesión HttpOnly independiente, limitada a `/admin`, SameSite Strict y Secure en HTTPS. Cada escritura exige OWNER activo, el origen exacto configurado y `X-Catalog-Request: 1`. La subida y el cambio del juego se guardan en una sola transacción.

## Comprobaciones

```text
npm run build
node --test tests/catalog.test.cjs tests/home-catalog.test.cjs tests/creator-features.test.cjs tests/level38.test.cjs
```

Con `LEVEL38_TEST_DATABASE_URL` apuntando a una base de datos desechable cuyo nombre contenga `test`:

```text
node --test tests/integration/creator-catalog.test.cjs
```

Esta prueba verifica permisos, origen, subida real, descripción bilingüe, escape de HTML, conflicto de edición, ocultación y persistencia tras otro arranque/migración. Nunca ejecutarla contra producción.
