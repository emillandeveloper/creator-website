# Conector local para Final Fantasy X HD Remaster (Steam / Windows)

Esta es **solo una prueba de conexión** entre el panel privado de Leo y su PC. El conector identifica si `FFX.exe` está abierto, recibe órdenes simuladas desde la web y las confirma al overlay de OBS. **No lee ni modifica la memoria del juego. No cambia HP, objetos, comandos ni guardados.** Tampoco canjea puntos reales de Twitch.

## Preparación en Windows

1. Instala **Node.js 22 LTS o superior** en el PC del stream, si todavía no lo tienes. No hace falta instalar dependencias de este proyecto.
2. Descarga el repositorio `emillandeveloper/creator-website` como ZIP y extrae la carpeta `tools/ffx-agent` donde quieras (por ejemplo, en Documentos). También vale actualizar un clon del repositorio.
3. En tu web, entra en **Admin → Twitch Chaos → Generar clave para mi PC**, con la sesión de propietario iniciada. El botón de copiar permite conservar la clave sin mostrarla en pantalla.
4. En la carpeta `ffx-agent`, copia `.env.example` y renombra la copia como **`.env`**. Sustituye el valor de `CHAOS_AGENT_TOKEN` por la clave de 43 caracteres que acabas de copiar. Si tu web no usa el dominio indicado, cambia también `CHAOS_SERVER_ORIGIN` por el dominio HTTPS real, sin barra final.
5. Haz doble clic en **`start.bat`**. Deja abierta su ventana durante el directo. El programa saldrá por HTTPS hacia tu web: **no hay que abrir puertos** en el router.
6. Abre *Final Fantasy X* desde Steam. En el panel Chaos debería aparecer «Conectado · FFX.exe detectado». Si aparece «esperando a FFX.exe», comprueba que has abierto **FFX** y no **FFX-2** o solo el launcher.
7. Pulsa **Probar en PC** sobre una recompensa. La ventana del conector imprimirá una confirmación y el overlay de pruebas mostrará el efecto simulado. Todo el inventario y la vida deben permanecer intactos.

## Privacidad y seguridad

- `.env` contiene una **clave secreta** y está excluido de Git. No la compartas, no la muestres en OBS, no subas capturas de ella y no la pegues en chats.
- Si crees que se ha filtrado, genera una clave nueva en `/admin/chaos`. La anterior deja de funcionar inmediatamente. También necesitarás sustituirla en `.env` y reiniciar el conector.
- El agente solo ejecuta `tasklist.exe` para detectar el proceso, además de peticiones HTTPS con la clave. No descarga código del servidor ni ejecuta comandos del chat.
- Las peticiones de prueba caducan al cabo de 30 segundos; una orden reconocida solo se confirma una vez.
- El botón «Preparada para Twitch» sigue siendo una **configuración local**: no crea ni activa recompensas reales.

## Solución de problemas

- **«No se encuentra Node.js»**: instala Node.js y vuelve a abrir `start.bat`.
- **«Falta CHAOS_AGENT_TOKEN»**: revisa el `.env` y que su valor no tenga espacios o comillas extra.
- **«Clave rechazada»**: copia una clave nueva de la web, sustitúyela en `.env` y reinicia `start.bat`.
- **«Conexión no disponible»**: comprueba el servicio web de Render, que tienes Internet y el valor exacto de `CHAOS_SERVER_ORIGIN`.
- **El juego no se detecta**: confirma en el Administrador de tareas que existe un proceso llamado `FFX.exe`. Esta versión no detecta FFX-2.

La siguiente fase será implementar y verificar **un adaptador específico del FFX HD Remaster** capaz de ejecutar acciones reales, con protecciones para evitar dañar guardados o afectar a partidas no deseadas. Esa fase no se activa aquí.

## Diagnostico del inventario (fase siguiente)

Si la comunicacion ya funciona, haz una **partida guardada en un slot separado** y consigue al menos un objeto, preferiblemente una Pocion. Con FFX abierto, ejecuta `inspect-inventory.bat` en esta carpeta. Este inspector usa PowerShell de Windows y solo lee 336 bytes de la memoria del proceso: no necesita Node, no escribe en el juego ni toca los guardados.

Compara el numero de Pociones detectado con el que aparece en el inventario del juego. Si coinciden, comparte unicamente el resultado del inspector (PID, hash del ejecutable, cantidad y slot). **No pegues tu clave del conector.** Si ves un error o un numero distinto al del juego, detente: las direcciones de memoria historicas pueden no ser compatibles con tu version de Steam.

Referencia tecnica: [Farplane, FFX/Offsets.cs](https://github.com/topher-au/Farplane/blob/master/FFX/Offsets.cs) y [Farplane, FFX/Data/Item.cs](https://github.com/topher-au/Farplane/blob/master/FFX/Data/Item.cs). Un resultado correcto es una comprobacion inicial, no garantia de seguridad para futuras escrituras; primero validaremos cuidadosamente esa segunda fase.

## Primera prueba de escritura: UNA Pocion (solo manual)

**Requiere haber comprobado antes con `inspect-inventory.bat` que el numero de Pociones coincide exactamente con el juego.** Usa exclusivamente una partida de prueba en un slot de guardado separado y manten FFX abierto, con el inventario sin cambios.

1. Con al menos una Pocion y menos de 99, ejecuta `give-potion-once.bat` directamente en tu PC.
2. La ventana muestra el numero actual y el esperado (+1). Si no coinciden con lo que ves en el juego, no continúes.
3. Solo si todo coincide, escribe `SUMAR` y pulsa Intro. Cualquier otro texto cancela sin escribir.
4. El script valida el hash conocido del ejecutable, las 112 posiciones y cantidades del inventario y que nada haya cambiado mientras confirmabas. Solo entonces intenta cambiar **un byte**: la cantidad de la pila de Pociones. Lee ese byte otra vez para comprobar el resultado.
5. Cierra y vuelve a abrir el inventario de FFX. Comprueba visualmente el cambio y dime si ha pasado, por ejemplo, de 4 a 5 Pociones.

**No lo hace automaticamente Twitch Chaos.** Esta prueba no cambia el codigo del agente, no introduce canjes reales, no guarda la partida y no envia ninguna orden desde la web. Si algo falla, no repitas el script sin revisar primero el estado del inventario. Tras verificarlo conectaremos esta operacion al panel con habilitacion manual y limites estrictos.
