/*
  pdf.js
  ------------------------------------------------------------------
  Genera el PDF de la cotización con jsPDF + jspdf-autotable,
  reproduciendo el diseño de la hoja "COTIZACION UNIFICADA":
  violeta #7B2D8B en encabezados, tabla de ítems en crema #FFF8E1,
  una sola página A4 vertical.
*/

const ReigerPdf = (function () {

  const VIOLETA = [123, 45, 139];
  const VIOLETA_OSC = [92, 33, 104];
  const CREMA = [255, 248, 225];
  const NAVY = [31, 56, 100];
  const LAVANDA = [237, 217, 245];
  const GRIS_TEXTO = [60, 60, 60];

  function generar(datos) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const anchoPag = 210, margen = 14;
    let y = 0;

    // -------- Encabezado --------
    // Logo grande, centrado arriba (estilo membrete), con el título y
    // los datos de contacto debajo, también centrados.
    const logoAncho = 46, logoAlto = logoAncho * (507 / 630);
    if (window.REIGER_LOGO_BASE64) {
      try {
        doc.addImage(window.REIGER_LOGO_BASE64, "JPEG", (anchoPag - logoAncho) / 2, 7, logoAncho, logoAlto);
      } catch (e) { /* si falla la imagen, seguimos sin logo */ }
    }
    y = 7 + logoAlto + 4;

    doc.setTextColor(...VIOLETA);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("COTIZACIÓN", anchoPag / 2, y, { align: "center" });
    y += 5.5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`${datos.contacto.email}   |   ${datos.contacto.telefono}`, anchoPag / 2, y, { align: "center" });
    y += 5;

    doc.setDrawColor(...VIOLETA);
    doc.setLineWidth(0.6);
    doc.line(margen, y, anchoPag - margen, y);
    y += 6;

    // -------- Datos del cliente --------
    doc.setFillColor(...LAVANDA);
    doc.rect(margen, y, anchoPag - margen * 2, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...VIOLETA_OSC);
    doc.text("DATOS DEL CLIENTE", margen + 2, y + 4.3);
    y += 10;

    const colIzqX = margen, colDerX = 110;
    doc.setFontSize(9);
    const filasIzq = [
      ["Cliente:", datos.cliente],
      ["Dirección:", datos.direccion],
      ["Ciudad:", datos.ciudad],
      ["País:", datos.pais],
      ["Cond. pago:", datos.condPago]
    ];
    const filasDer = [
      ["N° Consulta:", String(datos.numero)],
      ["Fecha:", datos.fecha],
      ["Validez:", datos.validez],
      ["Incoterm:", datos.incoterm]
    ];
    let yy = y;
    filasIzq.forEach(([label, valor]) => {
      doc.setFont("helvetica", "bold"); doc.text(label, colIzqX, yy);
      doc.setFont("helvetica", "normal"); doc.text(String(valor || "-"), colIzqX + 24, yy);
      yy += 5.2;
    });
    let yy2 = y;
    filasDer.forEach(([label, valor]) => {
      doc.setFont("helvetica", "bold"); doc.text(label, colDerX, yy2);
      doc.setFont("helvetica", "normal"); doc.text(String(valor || "-"), colDerX + 26, yy2);
      yy2 += 5.2;
    });
    y = Math.max(yy, yy2) + 2;

    doc.setFont("helvetica", "bold"); doc.text("Descripción de la oferta:", colIzqX, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(datos.set || "-"), colIzqX + 45, y);
    y += 8;

    // -------- Tabla de ítems --------
    const body = datos.items.map(it => [it.codigo, it.descripcion, String(it.cantidad)]);
    doc.autoTable({
      startY: y,
      margin: { left: margen, right: margen },
      head: [["Cód.", "Descripción del Producto", "Cant."]],
      body,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.8, textColor: GRIS_TEXTO, lineColor: [230, 220, 235], lineWidth: 0.1 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      bodyStyles: { fillColor: CREMA },
      columnStyles: {
        0: { cellWidth: 32 },
        2: { cellWidth: 18, halign: "center" }
      }
    });
    y = doc.lastAutoTable.finalY + 8;

    // -------- Totales --------
    const anchoBloque = 80;
    const xBloque = anchoPag - margen - anchoBloque;
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");

    // En "Sudamérica c/desc." se muestra el precio unitario con y sin
    // descuento antes del total, para que quede clara la rebaja aplicada.
    if (datos.modalidad === "Sudamérica c/desc.") {
      const pct = Math.round((datos.calculo.descuentoAplicado || 0) * 100);
      doc.text("Precio unitario (sin descuento):", xBloque, y);
      doc.text(ReigerCalc.formatoMoneda(datos.calculo.precioUnitarioConvertido, datos.moneda), anchoPag - margen, y, { align: "right" });
      y += 6;
      doc.text(`Precio unitario (con descuento ${pct}%):`, xBloque, y);
      doc.text(ReigerCalc.formatoMoneda(datos.calculo.precioUnitarioConDescuento, datos.moneda), anchoPag - margen, y, { align: "right" });
      y += 6;
    }

    doc.text(datos.calculo.etiquetaPrimeraLinea, xBloque, y);
    doc.text(ReigerCalc.formatoMoneda(datos.calculo.totalSetsConvertido, datos.moneda), anchoPag - margen, y, { align: "right" });
    y += 6;
    doc.text(datos.calculo.etiquetaSegundaLinea, xBloque, y);
    doc.text(ReigerCalc.formatoMoneda(datos.calculo.segundaLineaConvertida, datos.moneda), anchoPag - margen, y, { align: "right" });
    y += 8;

    doc.setDrawColor(...VIOLETA);
    doc.setLineWidth(0.4);
    doc.line(xBloque, y - 4, anchoPag - margen, y - 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...VIOLETA_OSC);
    doc.text(datos.calculo.etiquetaTotalFinal, xBloque, y + 2);
    doc.text(ReigerCalc.formatoMoneda(datos.calculo.totalFinal, datos.moneda), anchoPag - margen, y + 2, { align: "right" });
    doc.setTextColor(...GRIS_TEXTO);
    y += 12;

    // -------- Forma de pago --------
    doc.setFillColor(...LAVANDA);
    doc.rect(margen, y, anchoPag - margen * 2, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...VIOLETA_OSC);
    doc.text("FORMA DE PAGO", margen + 2, y + 4.3);
    doc.setTextColor(...GRIS_TEXTO);
    y += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Precio base (${datos.basePago}): ${ReigerCalc.formatoMoneda(datos.calculo.precioBasePlan, datos.moneda)}`, margen, y); y += 5.2;
    doc.text(`50% para iniciar producción: ${ReigerCalc.formatoMoneda(datos.calculo.pagoInicio, datos.moneda)}`, margen, y); y += 5.2;
    doc.text(`50% al finalizar producción: ${ReigerCalc.formatoMoneda(datos.calculo.pagoFinal, datos.moneda)}`, margen, y); y += 5.2;
    doc.text("Pago mediante transferencia bancaria.", margen, y); y += 4.5;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Si no cuenta con la posibilidad de efectuar transferencias al exterior, no dude en consultarnos.", margen, y);
    doc.setTextColor(...GRIS_TEXTO);
    y += 8;

    // -------- Notas legales --------
    doc.setFontSize(7.3);
    doc.setTextColor(110, 110, 110);
    (datos.notas || []).forEach(nota => {
      const lineas = doc.splitTextToSize(nota, anchoPag - margen * 2);
      doc.text(lineas, margen, y);
      y += lineas.length * 3.4 + 1;
    });
    y += 3;

    // -------- Datos bancarios --------
    doc.setDrawColor(220, 210, 225);
    doc.setLineWidth(0.2);
    doc.line(margen, y, anchoPag - margen, y);
    y += 5;
    doc.setFontSize(8.3);
    doc.setTextColor(...GRIS_TEXTO);
    doc.setFont("helvetica", "bold");
    doc.text(datos.banco.nombre, margen, y); y += 4.2;
    doc.setFont("helvetica", "normal");
    doc.text(`Swift Code: ${datos.banco.swift}`, margen, y); y += 4.2;
    doc.text(`Acct. N°: ${datos.banco.cuentaNumero}`, margen, y); y += 4.2;
    doc.text(`Acct. Name: ${datos.banco.cuentaTitular}`, margen, y);

    // -------- Banner de pie de página --------
    dibujarBannerPie(doc, anchoPag, margen);

    return doc;
  }

  // Banner institucional real (imagen provista), fijo al pie de la página.
  function dibujarBannerPie(doc, anchoPag, margen) {
    const altoPag = 297;
    if (!window.REIGER_BANNER_BASE64) return;
    const anchoBanda = anchoPag - margen * 2;
    // Proporción real de la imagen (1282 x 247 px).
    const altoBanda = anchoBanda * (247 / 1282);
    const yTop = altoPag - 12 - altoBanda;
    try {
      doc.addImage(window.REIGER_BANNER_BASE64, "JPEG", margen, yTop, anchoBanda, altoBanda);
    } catch (e) { /* si falla la imagen, seguimos sin banner */ }
  }

  function nombreArchivo(numero, cliente, set) {
    const limpiar = s => String(s || "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
    return `COT-${String(numero).padStart(4, "0")} - ${limpiar(cliente)} - ${limpiar(set)}.pdf`.slice(0, 150);
  }

  return { generar, nombreArchivo };
})();
