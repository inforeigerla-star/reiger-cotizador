/*
  calc.js
  ------------------------------------------------------------------
  Motor de cálculo. Replica las reglas de negocio de la hoja
  "COTIZACION UNIFICADA" del Excel:

    subtotalSetsUSD = precioUnitarioSetUSD * cantidadSets * (1 - descuentoSegunModalidad)
    envioTotalUSD    = 0 si modalidad = Argentina; si no, envioUnitario*cantidadSets si "incluir envío"
    ivaUSD           = subtotalSetsUSD * ivaPct  si modalidad = Argentina; si no 0
    factorMoneda     = dolarVenta si moneda de salida = ARS; si no 1
    totalSetsConvert = subtotalSetsUSD * factorMoneda
    segundaLinea     = (ivaUSD o envioTotalUSD, según modalidad) * factorMoneda
    totalFinal        = totalSetsConvert + segundaLinea

  A diferencia del Excel, acá la celda "F32" (IVA/envío) se calcula
  siempre en vivo — en el Excel original quedó pisada con un valor fijo
  (2500) que no se actualizaba solo.

  El precio se calcula por SET (no por ítem individual): los ítems son
  la lista de componentes que trae el set, informativa, tal como
  funciona hoy realmente en el Excel.
*/

const ReigerCalc = (function () {

  function precioUnitarioSet(datosSets, nombreSet, modalidad) {
    const info = datosSets[nombreSet];
    if (!info) return null;
    const valor = modalidad === "Argentina" ? info.argentina : info.exterior;
    return (valor === null || valor === undefined || !isFinite(valor)) ? null : valor;
  }

  function descuentoPorCantidad(tablaDescuentos, cantidadSets) {
    const v = tablaDescuentos[cantidadSets];
    return typeof v === "number" ? v : 0;
  }

  function calcular(input) {
    const {
      modalidad,            // "Argentina" | "Sudamérica" | "Sudamérica c/desc."
      cantidadSets,         // int
      precioUnitarioUSD,    // number | null
      tablaDescuentos,      // {1:0, 2:0.02, ...}
      envioUnitarioUSD,     // number
      incluirEnvio,         // boolean
      monedaSalida,         // "USD" | "ARS"
      dolarVenta,           // number
      ivaPct,               // number (0.21)
      baseParaPlanDePago    // "Precio sin IVA" | "Precio con IVA"
    } = input;

    const precioValido = typeof precioUnitarioUSD === "number" && isFinite(precioUnitarioUSD);
    const cant = Math.max(0, Number(cantidadSets) || 0);

    const descuentoAplicado = descuentoPorCantidad(tablaDescuentos, cant);
    const descuentoSegunModalidad = modalidad === "Sudamérica c/desc." ? descuentoAplicado : 0;

    const precioBaseUSD = precioValido ? precioUnitarioUSD : 0;
    const subtotalSetsUSD = precioBaseUSD * cant * (1 - descuentoSegunModalidad);

    const envioTotalUSD = modalidad === "Argentina"
      ? 0
      : (incluirEnvio ? envioUnitarioUSD * cant : 0);

    const ivaUSD = modalidad === "Argentina" ? subtotalSetsUSD * ivaPct : 0;

    const factorMoneda = monedaSalida === "ARS" ? (Number(dolarVenta) || 1) : 1;

    const totalSetsConvertido = subtotalSetsUSD * factorMoneda;
    const segundaLineaUSD = modalidad === "Argentina" ? ivaUSD : envioTotalUSD;
    const segundaLineaConvertida = segundaLineaUSD * factorMoneda;
    const totalFinal = totalSetsConvertido + segundaLineaConvertida;

    // Precio unitario del set convertido a la moneda de salida, SIN descuento.
    // Se muestra siempre junto al de "con descuento" en modalidad Sudamérica c/desc.
    const precioUnitarioConvertido = precioBaseUSD * factorMoneda;
    const precioUnitarioConDescuento = precioBaseUSD * (1 - descuentoAplicado) * factorMoneda;

    const precioBasePlan = baseParaPlanDePago === "Precio con IVA" ? totalFinal : totalSetsConvertido;
    const pagoInicio = precioBasePlan * 0.5;
    const pagoFinal = precioBasePlan * 0.5;

    // Etiqueta de la segunda línea, igual que B32 en el Excel
    let etiquetaSegundaLinea;
    if (modalidad === "Argentina") {
      etiquetaSegundaLinea = `IVA (${(ivaPct * 100).toFixed(0)}%):`;
    } else if (incluirEnvio) {
      etiquetaSegundaLinea = "Envío estimado:";
    } else {
      etiquetaSegundaLinea = "Cotización sin envío:";
    }

    let etiquetaPrimeraLinea = modalidad === "Argentina"
      ? "PRECIO TOTAL (sin IVA ni aranceles):"
      : "PRECIO TOTAL Sets (sin envío):";

    let etiquetaTotalFinal = modalidad === "Argentina"
      ? "PRECIO TOTAL (con IVA):"
      : "PRECIO TOTAL:";

    return {
      precioValido,
      descuentoAplicado,
      descuentoSegunModalidad,
      subtotalSetsUSD,
      envioTotalUSD,
      ivaUSD,
      factorMoneda,
      totalSetsConvertido,
      segundaLineaConvertida,
      totalFinal,
      precioUnitarioConvertido,
      precioUnitarioConDescuento,
      precioBasePlan,
      pagoInicio,
      pagoFinal,
      etiquetaPrimeraLinea,
      etiquetaSegundaLinea,
      etiquetaTotalFinal
    };
  }

  function formatoMoneda(valor, moneda) {
    if (!isFinite(valor)) valor = 0;
    const s = valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${moneda} ${s}`;
  }

  return { precioUnitarioSet, descuentoPorCantidad, calcular, formatoMoneda };
})();
