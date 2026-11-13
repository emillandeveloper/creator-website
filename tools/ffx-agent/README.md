# Conector local para Final Fantasy X HD Remaster (Steam / Windows)

El conector identifica si `FFX.exe` está abierto, recibe órdenes de prueba desde la web y las confirma al overlay de OBS. Por defecto es **solo simulación**: no cambia HP, objetos ni comandos. Hay un único efecto real opcional, **sumar una Poción**, que requiere habilitación local deliberada, confirmación en el panel de propietario y una partida guardada de prueba. **Twitch Channel Points no activa todavía efectos reales.**

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
- En el modo normal, el agente solo ejecuta `tasklist.exe` para detectar el proceso, además de peticiones HTTPS con la clave. Con `CHAOS_LIVE_POTION=YES`, puede ejecutar únicamente el script local y revisable `give-potion-once.ps1` para añadir UNA Poción tras una orden de propietario. No descarga código del servidor ni ejecuta comandos arbitrarios del chat.
- Las peticiones de prueba caducan al cabo de 30 segundos; una orden reconocida solo se confirma una vez.
- El botón «Preparada para Twitch» sigue siendo una **configuración local**: no crea ni activa recompensas reales.

## Solución de problemas

- **«No se encuentra Node.js»**: instala Node.js y vuelve a abrir `start.bat`.
- **«Falta CHAOS_AGENT_TOKEN»**: revisa el `.env` y que su valor no tenga espacios o comillas extra.
- **«Clave rechazada»**: copia una clave nueva de la web, sustitúyela en `.env` y reinicia `start.bat`.
- **«Conexión no disponible»**: comprueba el servicio web de Render, que tienes Internet y el valor exacto de `CHAOS_SERVER_ORIGIN`.
- **El juego no se detecta**: confirma en el Administrador de tareas que existe un proceso llamado `FFX.exe`. Esta versión no detecta FFX-2.

Las acciones de curación, reducción de HP, bloqueo de Atacar y ruleta siguen siendo exclusivamente simulaciones.

## Diagnostico del inventario

Si la comunicacion ya funciona, haz una **partida guardada en un slot separado** y consigue al menos un objeto, preferiblemente una Pocion. Con FFX abierto, ejecuta `inspect-inventory.bat` en esta carpeta. Este inspector usa PowerShell de Windows y solo lee 336 bytes de la memoria del proceso: no necesita Node, no escribe en el juego ni toca los guardados.

Compara el numero de Pociones detectado con el que aparece en el inventario del juego. Si coinciden, comparte unicamente el resultado del inspector (PID, hash del ejecutable, cantidad y slot). **No pegues tu clave del conector.** Si ves un error o un numero distinto al del juego, detente: las direcciones de memoria historicas pueden no ser compatibles con tu version de Steam.

Referencia tecnica: [Farplane, FFX/Offsets.cs](https://github.com/topher-au/Farplane/blob/master/FFX/Offsets.cs) y [Farplane, FFX/Data/Item.cs](https://github.com/topher-au/Farplane/blob/master/FFX/Data/Item.cs). Un resultado correcto es una comprobacion inicial, no garantia de seguridad para futuras escrituras; primero validaremos cuidadosamente esa segunda fase.

## Primera prueba de escritura: UNA Pocion (script manual)

**Requiere haber comprobado antes con `inspect-inventory.bat` que el numero de Pociones coincide exactamente con el juego.** Usa exclusivamente una partida de prueba en un slot de guardado separado y manten FFX abierto, con el inventario sin cambios.

1. Con al menos una Pocion y menos de 99, ejecuta `give-potion-once.bat` directamente en tu PC.
2. La ventana muestra el numero actual y el esperado (+1). Si no coinciden con lo que ves en el juego, no continúes.
3. Solo si todo coincide, escribe `SUMAR` y pulsa Intro. Cualquier otro texto cancela sin escribir.
4. El script valida el hash conocido del ejecutable, las 112 posiciones y cantidades del inventario y que nada haya cambiado mientras confirmabas. Solo entonces intenta cambiar **un byte**: la cantidad de la pila de Pociones. Lee ese byte otra vez para comprobar el resultado.
5. Cierra y vuelve a abrir el inventario de FFX. Comprueba visualmente el cambio y dime si ha pasado, por ejemplo, de 4 a 5 Pociones.

Esta prueba manual no contacta la web, no introduce canjes reales y no guarda la partida. Si algo falla, no repitas el script sin revisar primero el inventario.

## Una Poción desde la web (nueva prueba supervisada)

**Primero haz una copia de tu guardado en un slot separado.** Ya hemos comprobado manualmente que FFX admite la suma de una Poción; ahora podemos probar el circuito completo desde tu panel privado.

1. Actualiza **todos** los ficheros de `tools/ffx-agent` desde GitHub, sin borrar tu `.env` personal ni su clave privada.
2. Cierra cualquier `start.bat` que tengas abierto con Ctrl+C. Deja abierta **una sola instancia** del conector.
3. Edita tu `.env` y añade `CHAOS_LIVE_POTION=YES` en una línea nueva. Si copiaste el `.env.example` actualizado ya tendrás `CHAOS_LIVE_POTION=NO`; cambia solo `NO` por `YES`.
4. Ejecuta `start.bat`. La consola advertirá que hay **una sola aplicación real de Poción** habilitada. Este permiso local se desactiva **automáticamente después de la primera orden real**, incluso si falla. **Ojo:** reiniciar otra vez con `CHAOS_LIVE_POTION=YES` lo volvería a habilitar; pon `NO` al terminar.
5. Abre FFX y, desde el inventario, comprueba el número actual de Pociones (1 a 98). No uses ni reorganices objetos mientras se hace la prueba.
6. En tu web, abre **Admin → Twitch Chaos**. Verás «Poción real ARMADA» y, en la recompensa «Regalar una poción», el botón **«Aplicar +1 poción REAL»**. Al pulsarlo tendrás que confirmar de nuevo en el navegador.
7. Comprueba el mensaje de la consola, cierra y vuelve a abrir el inventario de FFX y verifica que la cantidad ha aumentado exactamente uno. El overlay debería mostrar la prueba real y el historial indicará si el agente confirmó la operación.
8. Cuando termines, cambia de nuevo `CHAOS_LIVE_POTION=NO` y reinicia el conector para dejarlo en modo seguro. No es necesario regenerar la clave privada.

**Ningún espectador puede activar esta operación desde Twitch.** Si ves un error, un resultado distinto o no aparece la confirmación, no hagas una segunda prueba hasta que revisemos el estado de la partida. El conector no reintenta escrituras por su cuenta.
