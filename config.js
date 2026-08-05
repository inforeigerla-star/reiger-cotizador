/*
  CONFIGURACIÓN DE LA APP
  ------------------------------------------------------------------
  Editá estos valores antes de publicar la app (o cuando quieras
  cambiarlos). Este archivo se sirve tal cual al navegador: cualquiera
  que abra el link y mire el código fuente puede ver el PIN. No es
  seguridad real, es solo una traba para que no entre cualquiera que
  encuentre la URL por casualidad.
*/
window.REIGER_CONFIG = {
  // PIN de acceso (texto libre, podés poner letras y números)
  pin: "REIGER2026",

  // Datos de contacto que aparecen en el encabezado del PDF
  contacto: {
    email: "oficina@reigersuspensionla.com",
    telefono: "+ 54 9 3548 743-798"
  },

  // Datos bancarios que aparecen al pie del PDF
  banco: {
    nombre: "Banco GNB Paraguay S.A",
    swift: "BGNBPYPX",
    cuentaNumero: "0602645166",
    cuentaTitular: "JPO GROUP E.A.S"
  },

  // Notas legales que aparecen al pie del PDF
  notas: [
    "* No asumimos responsabilidad por multas adicionales, retenciones que excedan los plazos estimados o impuestos que no hayan sido previstos.",
    "* El precio del envío se encuentra incluido dentro del precio final, tener en cuenta que es un aproximado y puede variar."
  ],

  // Valores por defecto del panel de control
  defaults: {
    envioUnitarioUSD: 1200,
    ivaPct: 0.21,
    validez: "Una semana",
    incoterm: "EXW",
    condPago: "Transferencia",
    monedaSalida: "USD",
    baseParaPlanDePago: "Precio sin IVA"
  },

  // Plantilla del mensaje de WhatsApp. Variables disponibles:
  // {cliente} {numero} {set} {total} {moneda}
  mensajeWhatsapp:
    "Hola {cliente}, te compartimos la cotización N° {numero} para {set}. " +
    "Total: {moneda} {total}. Cualquier consulta quedamos a disposición. " +
    "Saludos, Reiger Suspension Latinoamérica.",

  // Tabla de descuentos por cantidad de sets (modalidad "Sudamérica c/desc.")
  // Editable también desde la propia app (panel de control); esto es solo
  // el valor inicial la primera vez que se usa la app en un navegador.
  tablaDescuentos: {
    1: 0, 2: 0.02, 3: 0.03, 4: 0.04, 5: 0.05,
    6: 0.06, 7: 0.07, 8: 0.08, 9: 0.09, 10: 0.10
  },

  // Máximo de ítems por cotización (igual que en el Excel actual)
  maxItems: {
    normal: 12,          // modalidad "Argentina" o "Sudamérica"
    conDescuento: 8      // modalidad "Sudamérica c/desc."
  },

  paises: [
    "Argentina","Bolivia","Brasil","Canadá","Chile","Colombia","Costa Rica",
    "Cuba","Ecuador","El Salvador","Estados Unidos","Guatemala","Haití",
    "Honduras","Jamaica","México","Nicaragua","Panamá","Paraguay","Perú",
    "Puerto Rico","República Dominicana","Trinidad y Tobago","Uruguay","Venezuela"
  ]
};
