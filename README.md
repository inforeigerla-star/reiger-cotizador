# Cotizador Reiger Suspension Latinoamérica

App web gratuita (sin costos de hosting ni de licencias) para generar
cotizaciones en PDF, pensada para reemplazar el Excel con macros. Corre
en el navegador — Windows, Mac, Linux o celular — sin instalar nada.

## Cómo funciona (resumen)

- Los precios y los sets se siguen manteniendo en tu archivo
  `BASE_DE_DATOS_3.xlsm` de siempre. La app lo lee **en tu propio
  navegador** cuando lo seleccionás — el archivo nunca se sube a
  ningún servidor.
- El PDF se genera en el navegador y se descarga a tu carpeta de
  Descargas habitual.
- El historial de cotizaciones se guarda en el navegador (ver
  limitaciones más abajo).
- Antes de entrar hay que escribir un PIN (configurable).

## Uso día a día

1. Abrí el link de la app.
2. Ingresá el PIN.
3. Botón **"Elegí tu archivo"**: seleccioná tu `BASE_DE_DATOS_3.xlsm`
   actualizado. Hacelo cada vez que abras la app, o cada vez que hayas
   modificado precios en el Excel.
4. Completá los datos del cliente y elegí el **Set** — los componentes
   se cargan solos (los podés editar o borrar fila por fila).
5. Ajustá el **panel de control** (modalidad, cantidad de sets, envío,
   moneda). Los totales se recalculan solos.
6. Botón **"Generar PDF"**: descarga el PDF y lo registra en el
   historial con numeración automática.
7. Botón **"Abrir WhatsApp con el mensaje"**: abre WhatsApp con el
   texto ya escrito. Como el navegador no puede copiar el PDF al
   portapapeles (eso era un truco específico de la macro de Excel con
   PowerShell, que no existe en la web), tenés que **adjuntar
   manualmente** el PDF que se acaba de descargar — arrastralo al chat
   o usá el botón del clip. En el celular es más directo: el botón
   "compartir" del navegador manda el PDF derecho a WhatsApp.

## Publicar la app gratis en GitHub Pages

No hace falta saber usar git.

1. Entrá a [github.com](https://github.com) y creá una cuenta gratis
   si no tenés.
2. Creá un repositorio nuevo, por ejemplo `reiger-cotizador`. Marcalo
   como **privado** si querés que no aparezca listado públicamente
   (igual va a ser accesible por quien tenga el link una vez
   publicado — ver aviso de seguridad más abajo).
3. Dentro del repositorio, usá el botón **"Add file" → "Upload
   files"** y arrastrá **todo el contenido** de esta carpeta
   (`index.html`, `config.js`, la carpeta `css/` y la carpeta `js/`,
   manteniendo esa misma estructura).
4. Confirmá el commit ("Commit changes").
5. Andá a **Settings → Pages**, y en "Source" elegí la rama `main` y
   la carpeta `/ (root)`. Guardá.
6. GitHub te va a dar un link tipo
   `https://tu-usuario.github.io/reiger-cotizador/` — ese es el que
   usás (y compartís con quien vaya a cotizar) de acá en adelante.
7. Cada vez que quieras actualizar la app (cambiar el diseño del PDF,
   el PIN, etc.), volvé a subir los archivos modificados desde
   "Add file → Upload files" — se actualiza sola en un minuto.

## Configuración (`config.js`)

Abrí ese archivo con cualquier editor de texto para cambiar:

- El **PIN** de acceso.
- Los datos de contacto y bancarios que aparecen en el PDF.
- Las notas legales del pie del PDF.
- Los valores por defecto del panel de control (envío unitario, IVA,
  validez, incoterm, etc.)
- La tabla de descuentos por cantidad de sets.
- La plantilla del mensaje de WhatsApp.

Después de editarlo, volvé a subirlo a GitHub como se explica arriba.

## Limitaciones que conviene tener claras

- **El PIN no es seguridad real.** Es una traba simple del lado del
  navegador. Alguien con conocimientos técnicos podría mirar el código
  fuente de la página y evitarlo. No la uses para proteger información
  que no puedas permitirte que se filtre.
- **El historial no se sincroniza solo entre dispositivos.** Vive en
  el navegador de cada PC/celular donde uses la app. Para llevarlo de
  un lado a otro: "Ver historial" → "Exportar a Excel" en un
  dispositivo, y "Importar historial" en el otro.
- **El envío por WhatsApp requiere un paso manual** (adjuntar el PDF
  descargado), a diferencia del copiado automático al portapapeles que
  hacía la macro de Excel. Automatizarlo del todo requeriría la API
  oficial de WhatsApp Business (de pago, con aprobación de Meta).
- **Los totales pueden no coincidir con cotizaciones viejas del
  Excel.** Se encontró que la celda que calculaba el IVA/envío en el
  Excel (F32) estaba pisada con un valor fijo (2.500) en vez de
  recalcularse — esta app lo hace bien, así que compará con cuidado si
  cruzás números contra el historial anterior.
- Si el Excel se guardó con el cálculo automático desactivado, los
  precios que lee la app pueden estar desactualizados (lee los
  últimos valores calculados y guardados por Excel, no vuelve a
  ejecutar las fórmulas de costeo de la hoja "Precios").
