/*
  app.js
  ------------------------------------------------------------------
  Wiring de la interfaz: PIN, carga de Excel, formulario, ítems,
  totales en vivo, generación de PDF, historial y WhatsApp.
*/

(function () {
  const CFG = window.REIGER_CONFIG;

  // ---------------- Estado ----------------
  let excelData = null;         // resultado de ReigerXlsx.cargarArchivo
  let items = [];               // [{codigo, descripcion, cantidad}]
  let tablaDescuentos = cargarTablaDescuentos();
  let ultimaCotizacionGenerada = null; // para habilitar el botón de WhatsApp

  // ---------------- Utilidades ----------------
  const $ = (id) => document.getElementById(id);

  function cargarTablaDescuentos() {
    try {
      const raw = localStorage.getItem("reiger_tabla_descuentos_v1");
      if (raw) return JSON.parse(raw);
    } catch (e) { /* noop */ }
    return Object.assign({}, CFG.tablaDescuentos);
  }
  function guardarTablaDescuentos() {
    localStorage.setItem("reiger_tabla_descuentos_v1", JSON.stringify(tablaDescuentos));
  }

  function maxItemsActual() {
    return $("fModalidad").value === "Sudamérica c/desc." ? CFG.maxItems.conDescuento : CFG.maxItems.normal;
  }

  // ==========================================================
  // PIN
  // ==========================================================
  function initPin() {
    const yaEntro = sessionStorage.getItem("reiger_pin_ok") === "1";
    if (yaEntro) return mostrarApp();

    $("pinBoton").addEventListener("click", intentarPin);
    $("pinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarPin(); });
    $("pinInput").focus();
  }

  function intentarPin() {
    const valor = $("pinInput").value.trim();
    if (valor === CFG.pin) {
      sessionStorage.setItem("reiger_pin_ok", "1");
      mostrarApp();
    } else {
      $("pinError").textContent = "PIN incorrecto.";
      $("pinInput").value = "";
      $("pinInput").focus();
    }
  }

  function mostrarApp() {
    $("pantallaPin").classList.add("oculto");
    $("app").classList.remove("oculto");
    initApp();
  }

  // ==========================================================
  // Inicialización de la app
  // ==========================================================
  function initApp() {
    $("contactoHeader").textContent = `${CFG.contacto.email}  ·  ${CFG.contacto.telefono}`;

    // País
    const fPais = $("fPais");
    CFG.paises.forEach(p => {
      const op = document.createElement("option");
      op.value = p; op.textContent = p;
      fPais.appendChild(op);
    });

    // Defaults
    $("fFecha").valueAsDate = new Date();
    $("fValidez").value = CFG.defaults.validez;
    $("fIncoterm").value = CFG.defaults.incoterm;
    $("fCondPago").value = CFG.defaults.condPago;
    $("fEnvioUnitario").value = CFG.defaults.envioUnitarioUSD;
    $("fMoneda").value = CFG.defaults.monedaSalida;
    $("fBasePago").value = CFG.defaults.baseParaPlanDePago;
    $("fNConsulta").value = ReigerHistorial.siguienteNumero();

    renderTablaDescuentos();
    actualizarVisibilidadDescuentos();
    renderItems();
    recalcularTotales();

    // Listeners
    $("inputExcel").addEventListener("change", onArchivoSeleccionado);
    $("fSet").addEventListener("change", onSetSeleccionado);
    $("fModalidad").addEventListener("change", () => {
      actualizarVisibilidadDescuentos();
      limitarItemsAlMaximo();
      recalcularTotales();
    });
    ["fCantidadSets", "fEnvioUnitario", "fIncluirEnvio", "fMoneda", "fDolarVenta", "fBasePago", "fCliente"]
      .forEach(id => $(id).addEventListener("input", recalcularTotales));

    $("btnAgregarItem").addEventListener("click", () => {
      if (items.length >= maxItemsActual()) return;
      items.push({ codigo: "", descripcion: "", cantidad: 1 });
      renderItems();
    });

    $("btnGenerarPdf").addEventListener("click", generarPdf);
    $("btnWhatsapp").addEventListener("click", abrirWhatsapp);

    $("btnVerHistorial").addEventListener("click", () => {
      renderHistorial();
      $("modalHistorial").classList.remove("oculto");
    });
    $("btnCerrarHistorial").addEventListener("click", () => $("modalHistorial").classList.add("oculto"));
    $("btnExportarHistorial").addEventListener("click", () => ReigerHistorial.exportarXlsx());
    $("btnImportarHistorialBtn").addEventListener("click", () => $("inputImportarHistorial").click());
    $("inputImportarHistorial").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const n = await ReigerHistorial.importarXlsx(file);
        alert(`Historial actualizado: ${n} cotizaciones en total.`);
        renderHistorial();
        $("fNConsulta").value = ReigerHistorial.siguienteNumero();
      } catch (err) {
        alert("No pude importar el archivo: " + err.message);
      }
      e.target.value = "";
    });
  }

  // ==========================================================
  // Carga del Excel
  // ==========================================================
  async function onArchivoSeleccionado(e) {
    const file = e.target.files[0];
    if (!file) return;
    const estado = $("estadoArchivo");
    estado.className = "estado-archivo";
    estado.innerHTML = "Leyendo archivo…";

    try {
      excelData = await ReigerXlsx.cargarArchivo(file);

      estado.className = "estado-archivo ok";
      estado.innerHTML = `Cargado: <strong>${file.name}</strong> — ${excelData.setOrder.length} sets, ${excelData.codigosList.length} códigos.`;

      const fSet = $("fSet");
      fSet.innerHTML = '<option value="">— Elegí un set —</option>';
      excelData.setOrder.forEach(nombre => {
        const op = document.createElement("option");
        op.value = nombre; op.textContent = nombre;
        fSet.appendChild(op);
      });

      const datalist = $("datalistCodigos");
      datalist.innerHTML = "";
      excelData.codigosList.forEach(cod => {
        const op = document.createElement("option");
        op.value = cod; op.label = excelData.codigos[cod] || "";
        datalist.appendChild(op);
      });

      if (excelData.dolarVenta) $("fDolarVenta").value = excelData.dolarVenta;
      if (typeof excelData.ivaPct === "number") CFG.defaults.ivaPct = excelData.ivaPct;

      recalcularTotales();
    } catch (err) {
      estado.className = "estado-archivo error";
      estado.innerHTML = "Error al leer el archivo: " + err.message;
      excelData = null;
    }
    // Volvemos a poner el input de archivo visible para poder recargarlo
    const inputViejo = $("inputExcel");
    const clon = inputViejo.cloneNode(true);
    inputViejo.parentNode.replaceChild(clon, inputViejo);
    clon.addEventListener("change", onArchivoSeleccionado);
  }

  function onSetSeleccionado() {
    const nombreSet = $("fSet").value;
    if (!excelData || !nombreSet) { recalcularTotales(); return; }

    const componentes = excelData.componentesPorSet[nombreSet] || [];
    const max = maxItemsActual();
    // La descripción visible sigue la misma prioridad que el Excel original:
    // primero BASE DE DATOS (VLOOKUP por código); Info!B solo como respaldo
    // si el código no está cargado en BASE DE DATOS.
    items = componentes.slice(0, max).map(c => ({
      codigo: c.codigo,
      descripcion: excelData.codigos[c.codigo] || c.descripcion || "",
      cantidad: 1
    }));
    renderItems();
    recalcularTotales();
  }

  // ==========================================================
  // Ítems
  // ==========================================================
  function limitarItemsAlMaximo() {
    const max = maxItemsActual();
    if (items.length > max) {
      items = items.slice(0, max);
      renderItems();
    } else {
      renderItems();
    }
  }

  function renderItems() {
    const tbody = $("tbodyItems");
    tbody.innerHTML = "";
    items.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:center; color:#999;">${idx + 1}</td>
        <td class="col-codigo">
          <input type="text" list="datalistCodigos" value="${escapeAttr(item.codigo)}" data-idx="${idx}" data-campo="codigo">
        </td>
        <td>
          <input type="text" value="${escapeAttr(item.descripcion)}" data-idx="${idx}" data-campo="descripcion">
        </td>
        <td class="col-cant">
          <input type="number" min="1" max="999" value="${item.cantidad}" data-idx="${idx}" data-campo="cantidad">
        </td>
        <td><button type="button" class="quitar" data-idx="${idx}" title="Quitar ítem">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", onItemInputChange);
    });
    tbody.querySelectorAll("button.quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        items.splice(Number(btn.dataset.idx), 1);
        renderItems();
      });
    });

    $("itemsContador").textContent = `${items.length} / ${maxItemsActual()} ítems`;
    $("btnAgregarItem").disabled = items.length >= maxItemsActual();
  }

  function onItemInputChange(e) {
    const idx = Number(e.target.dataset.idx);
    const campo = e.target.dataset.campo;
    if (!items[idx]) return;
    if (campo === "codigo") {
      items[idx].codigo = e.target.value;
      if (excelData && excelData.codigos[e.target.value]) {
        items[idx].descripcion = excelData.codigos[e.target.value];
        renderItems();
        return;
      }
    } else if (campo === "cantidad") {
      items[idx].cantidad = Math.max(1, Number(e.target.value) || 1);
    } else {
      items[idx].descripcion = e.target.value;
    }
  }

  function escapeAttr(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // ==========================================================
  // Tabla de descuentos
  // ==========================================================
  function renderTablaDescuentos() {
    const tabla = $("tablaDescuentos");
    const cantidades = Object.keys(tablaDescuentos).map(Number).sort((a, b) => a - b);
    let html = "<tr><th>Sets</th>" + cantidades.map(c => `<td>${c}</td>`).join("") + "</tr>";
    html += "<tr><th>Desc.</th>" + cantidades.map(c =>
      `<td><input type="number" step="1" min="0" max="100" value="${Math.round(tablaDescuentos[c] * 100)}" data-cant="${c}"></td>`
    ).join("") + "</tr>";
    tabla.innerHTML = html;
    tabla.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        const cant = Number(inp.dataset.cant);
        tablaDescuentos[cant] = (Number(inp.value) || 0) / 100;
        guardarTablaDescuentos();
        recalcularTotales();
      });
    });
  }

  function actualizarVisibilidadDescuentos() {
    const esConDesc = $("fModalidad").value === "Sudamérica c/desc.";
    $("bloqueTablaDescuentos").classList.toggle("oculto", !esConDesc);
  }

  // ==========================================================
  // Cálculo y totales en vivo
  // ==========================================================
  function obtenerInputCalculo() {
    const modalidad = $("fModalidad").value;
    const nombreSet = $("fSet").value;
    const precioUnitarioUSD = excelData && nombreSet
      ? ReigerCalc.precioUnitarioSet(excelData.sets, nombreSet, modalidad)
      : null;

    $("fPrecioUnitario").value = precioUnitarioUSD !== null ? precioUnitarioUSD.toFixed(2) : "—";

    return {
      modalidad,
      cantidadSets: Number($("fCantidadSets").value) || 0,
      precioUnitarioUSD,
      tablaDescuentos,
      envioUnitarioUSD: Number($("fEnvioUnitario").value) || 0,
      incluirEnvio: $("fIncluirEnvio").value === "Sí",
      monedaSalida: $("fMoneda").value,
      dolarVenta: Number($("fDolarVenta").value) || 0,
      ivaPct: (excelData && typeof excelData.ivaPct === "number") ? excelData.ivaPct : CFG.defaults.ivaPct,
      baseParaPlanDePago: $("fBasePago").value
    };
  }

  function recalcularTotales() {
    const input = obtenerInputCalculo();
    const c = ReigerCalc.calcular(input);
    const moneda = input.monedaSalida;

    let html = "";
    if (input.modalidad === "Sudamérica c/desc." && c.precioValido) {
      html += fila("Precio unitario (sin descuento)", ReigerCalc.formatoMoneda(c.precioUnitarioConvertido, moneda));
      html += fila(`Precio unitario (con descuento ${Math.round(c.descuentoAplicado * 100)}%)`, ReigerCalc.formatoMoneda(c.precioUnitarioConDescuento, moneda));
    }
    html += fila(c.etiquetaPrimeraLinea, ReigerCalc.formatoMoneda(c.totalSetsConvertido, moneda));
    html += fila(c.etiquetaSegundaLinea, ReigerCalc.formatoMoneda(c.segundaLineaConvertida, moneda));
    html += `<div class="fila final"><span>${c.etiquetaTotalFinal}</span><span>${ReigerCalc.formatoMoneda(c.totalFinal, moneda)}</span></div>`;
    html += `<div class="fila pago"><span>50% inicio producción</span><span>${ReigerCalc.formatoMoneda(c.pagoInicio, moneda)}</span></div>`;
    html += `<div class="fila pago"><span>50% al finalizar</span><span>${ReigerCalc.formatoMoneda(c.pagoFinal, moneda)}</span></div>`;
    if (!c.precioValido) {
      html += `<div class="aviso" style="margin-top:.6rem;">Elegí un archivo Excel y un set para calcular el precio.</div>`;
    }
    $("bloqueTotales").innerHTML = html;

    $("btnGenerarPdf").disabled = !c.precioValido || !$("fCliente").value.trim();
  }
  function fila(label, valor) {
    return `<div class="fila"><span>${label}</span><span>${valor}</span></div>`;
  }

  // ==========================================================
  // Generar PDF
  // ==========================================================
  function generarPdf() {
    const cliente = $("fCliente").value.trim();
    const nombreSet = $("fSet").value;
    if (!cliente) { alert("Falta el nombre del cliente."); return; }
    if (!nombreSet) { alert("Elegí un set."); return; }
    if (!excelData) { alert("Primero cargá el archivo Excel con precios."); return; }

    const input = obtenerInputCalculo();
    const calculo = ReigerCalc.calcular(input);
    if (!calculo.precioValido) { alert("No encontré precio para ese set en la modalidad elegida."); return; }

    const numero = ReigerHistorial.siguienteNumero();
    const moneda = input.monedaSalida;

    const datosPdf = {
      numero,
      cliente,
      direccion: $("fDireccion").value.trim(),
      ciudad: $("fCiudad").value.trim(),
      pais: $("fPais").value,
      condPago: $("fCondPago").value,
      fecha: $("fFecha").value,
      validez: $("fValidez").value,
      incoterm: $("fIncoterm").value,
      set: nombreSet,
      modalidad: input.modalidad,
      items: items.filter(it => it.codigo || it.descripcion),
      moneda,
      basePago: input.baseParaPlanDePago,
      calculo,
      contacto: CFG.contacto,
      banco: CFG.banco,
      notas: CFG.notas
    };

    const doc = ReigerPdf.generar(datosPdf);
    const nombreArchivo = ReigerPdf.nombreArchivo(numero, cliente, nombreSet);
    doc.save(nombreArchivo);

    const registro = {
      numero,
      fecha: $("fFecha").value,
      cliente,
      pais: $("fPais").value,
      modalidad: input.modalidad,
      set: nombreSet,
      total: Number(calculo.totalFinal.toFixed(2)),
      moneda,
      whatsapp: $("fWhatsapp").value.trim(),
      estado: "GENERADA"
    };
    ReigerHistorial.agregarRegistro(registro);
    $("fNConsulta").value = ReigerHistorial.siguienteNumero();

    ultimaCotizacionGenerada = { registro, archivoNombre: nombreArchivo };
    $("btnWhatsapp").disabled = !registro.whatsapp;

    alert(
      `Cotización N° ${numero} generada y descargada como:\n${nombreArchivo}\n\n` +
      `Para mandarla por WhatsApp: usá el botón "Abrir WhatsApp con el mensaje" y ` +
      `adjuntá manualmente el PDF que se acaba de descargar (tu navegador no permite ` +
      `copiarlo al portapapeles como hacía la macro de Excel).`
    );
  }

  function abrirWhatsapp() {
    if (!ultimaCotizacionGenerada) return;
    const r = ultimaCotizacionGenerada.registro;
    if (!r.whatsapp) { alert("Falta el WhatsApp del cliente."); return; }

    const mensaje = CFG.mensajeWhatsapp
      .replace("{cliente}", r.cliente)
      .replace("{numero}", r.numero)
      .replace("{set}", r.set)
      .replace("{total}", r.total.toLocaleString("es-AR"))
      .replace("{moneda}", r.moneda);

    const numero = r.whatsapp.replace(/[^0-9]/g, "");
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  }

  // ==========================================================
  // Historial
  // ==========================================================
  function renderHistorial() {
    const tbody = $("tbodyHistorial");
    const lista = ReigerHistorial.obtenerTodos();
    tbody.innerHTML = lista.map(r => `
      <tr>
        <td><span class="badge">${r.numero}</span></td>
        <td>${r.fecha || ""}</td>
        <td>${r.cliente || ""}</td>
        <td>${r.pais || ""}</td>
        <td>${r.modalidad || ""}</td>
        <td>${r.set || ""}</td>
        <td>${(r.total ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
        <td>${r.moneda || ""}</td>
        <td>${r.whatsapp || ""}</td>
        <td>${r.estado || ""}</td>
      </tr>
    `).join("") || `<tr><td colspan="10" style="text-align:center; color:#999; padding:1.5rem;">Todavía no generaste ninguna cotización.</td></tr>`;
  }

  // ---------------- Arranque ----------------
  document.addEventListener("DOMContentLoaded", initPin);
})();
