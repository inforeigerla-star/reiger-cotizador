/*
  app.js
  ------------------------------------------------------------------
  Wiring de la interfaz: PIN, carga de Excel, formulario, ítems,
  totales en vivo, generación de PDF e historial.
*/

(function () {
  const CFG = window.REIGER_CONFIG;

  // ---------------- Estado ----------------
  let excelData = null;         // resultado de ReigerXlsx.cargarArchivo
  let items = [];               // [{codigo, descripcion, cantidad}]
  let tablaDescuentos = cargarTablaDescuentos();

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

  // ---------------- Cache del Excel cargado ----------------
  // Guarda los datos YA PARSEADOS (no el archivo original) en este
  // navegador, para no tener que volver a seleccionar el Excel cada
  // vez que se abre la app. Se pisa solo cuando el usuario carga un
  // archivo nuevo.
  const EXCEL_CACHE_KEY = "reiger_excel_cache_v1";

  function guardarExcelCache(data, nombreArchivo) {
    try {
      localStorage.setItem(EXCEL_CACHE_KEY, JSON.stringify({
        data, nombreArchivo, fecha: new Date().toISOString()
      }));
    } catch (e) {
      console.warn("No pude guardar el Excel en caché (puede ser muy grande para este navegador).", e);
    }
  }

  function leerExcelCache() {
    try {
      const raw = localStorage.getItem(EXCEL_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
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
  // T.C. (dólar oficial) automático, vía DolarAPI (gratis, sin key).
  // Se trae solo al abrir la app y con el botón ⟳; si falla (sin
  // conexión, etc.) se deja el valor que ya estuviera cargado.
  // ==========================================================
  async function actualizarDolarOficial() {
    const estado = $("dolarEstado");
    if (estado) estado.textContent = "Actualizando…";
    try {
      const resp = await fetch("https://dolarapi.com/v1/dolares/oficial");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      if (typeof data.venta !== "number") throw new Error("Respuesta inesperada");
      $("fDolarVenta").value = data.venta;
      recalcularTodo();
      const hora = new Date(data.fechaActualizacion || Date.now())
        .toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      if (estado) estado.textContent = `Oficial (DolarAPI) — actualizado ${hora}`;
    } catch (err) {
      if (estado) estado.textContent = "No se pudo actualizar automáticamente. Podés cargarlo a mano.";
      console.warn("No se pudo traer el dólar oficial:", err);
    }
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
    recalcularTodo();

    // Restaurar el Excel de la última vez, si hay uno guardado en este navegador
    const cache = leerExcelCache();
    if (cache && cache.data) {
      aplicarExcelData(cache.data, cache.nombreArchivo, cache.fecha);
    }

    // Dólar oficial en vivo (pisa el valor del Excel si la consulta funciona)
    actualizarDolarOficial();
    $("btnActualizarDolar").addEventListener("click", actualizarDolarOficial);

    // Listeners
    $("inputExcel").addEventListener("change", onArchivoSeleccionado);
    $("fSet").addEventListener("input", onSetSeleccionado);
    $("fModalidad").addEventListener("change", () => {
      actualizarVisibilidadDescuentos();
      limitarItemsAlMaximo();
      recalcularTodo();
    });
    ["fCantidadSets", "fEnvioUnitario", "fIncluirEnvio", "fMoneda", "fDolarVenta", "fBasePago", "fCliente"]
      .forEach(id => $(id).addEventListener("input", recalcularTodo));

    // Comparador de modalidades (Escenario B): reutiliza el mismo cliente,
    // ítems y set ya cargados en el panel principal; solo cambian modalidad,
    // cantidad de sets y envío, que es lo que se quiere comparar.
    $("fComparar").addEventListener("change", () => {
      const activo = $("fComparar").checked;
      $("bloqueComparacion").classList.toggle("oculto", !activo);
      if (activo) {
        $("fCantidadSetsB").value = $("fCantidadSets").value;
        $("fEnvioUnitarioB").value = $("fEnvioUnitario").value;
        $("fIncluirEnvioB").value = $("fIncluirEnvio").value;
        $("fModalidadB").value = $("fModalidad").value === "Argentina" ? "Sudamérica" : "Argentina";
      }
      actualizarVisibilidadDescuentos();
      recalcularTodo();
    });
    ["fModalidadB", "fCantidadSetsB", "fEnvioUnitarioB", "fIncluirEnvioB"].forEach(id =>
      $(id).addEventListener("input", () => {
        actualizarVisibilidadDescuentos();
        recalcularTodo();
      })
    );

    $("btnAgregarItem").addEventListener("click", () => {
      if (items.length >= maxItemsActual()) return;
      items.push({ codigo: "", descripcion: "", cantidad: 1 });
      renderItems();
    });

    $("btnGenerarPdf").addEventListener("click", generarPdf);

    $("btnVerHistorial").addEventListener("click", () => {
      renderHistorial();
      $("modalHistorial").classList.remove("oculto");
    });
    $("btnCerrarHistorial").addEventListener("click", () => $("modalHistorial").classList.add("oculto"));
    $("btnExportarHistorial").addEventListener("click", () => ReigerHistorial.exportarXlsx());
    $("btnImportarHistorialBtn").addEventListener("click", () => $("inputImportarHistorial").click());
    $("btnVaciarHistorial").addEventListener("click", () => {
      if (!confirm("¿Vaciar todo el historial de cotizaciones? Esta acción no se puede deshacer (los PDF ya descargados no se ven afectados).")) return;
      ReigerHistorial.vaciarTodo();
      renderHistorial();
    });
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
      const data = await ReigerXlsx.cargarArchivo(file);
      guardarExcelCache(data, file.name);
      aplicarExcelData(data, file.name, new Date().toISOString());
    } catch (err) {
      estado.className = "estado-archivo error";
      estado.innerHTML = "Error al leer el archivo: " + err.message +
        ` <input type="file" id="inputExcel" accept=".xlsx,.xlsm,.xls" title="Probar con otro archivo">`;
      const nuevoInput = estado.querySelector("#inputExcel");
      if (nuevoInput) nuevoInput.addEventListener("change", onArchivoSeleccionado);
      excelData = null;
    }
  }

  // Aplica datos ya parseados (recién cargados o restaurados de caché)
  // a la interfaz: combo de sets, datalist de códigos, T.C. e IVA.
  function aplicarExcelData(data, nombreArchivo, fechaIso) {
    excelData = data;
    const estado = $("estadoArchivo");
    const fecha = fechaIso ? new Date(fechaIso).toLocaleString("es-AR") : "";
    estado.className = "estado-archivo ok";
    estado.innerHTML = `Cargado: <strong>${nombreArchivo || "archivo"}</strong>` +
      (fecha ? ` (guardado el ${fecha})` : "") +
      ` — ${data.setOrder.length} sets, ${data.codigosList.length} códigos.` +
      ` <input type="file" id="inputExcel" accept=".xlsx,.xlsm,.xls" title="Cargar otro archivo">`;
    // El input de arriba reemplaza al que había; hay que re-engancharlo.
    const nuevoInput = estado.querySelector("#inputExcel");
    if (nuevoInput) nuevoInput.addEventListener("change", onArchivoSeleccionado);

    const fSet = $("fSet");
    const setElegido = fSet.value;
    const datalistSets = $("datalistSets");
    datalistSets.innerHTML = "";
    data.setOrder.forEach(nombre => {
      const op = document.createElement("option");
      op.value = nombre;
      datalistSets.appendChild(op);
    });
    fSet.value = (setElegido && data.setOrder.includes(setElegido)) ? setElegido : "";

    const datalist = $("datalistCodigos");
    datalist.innerHTML = "";
    data.codigosList.forEach(cod => {
      const op = document.createElement("option");
      op.value = cod; op.label = data.codigos[cod] || "";
      datalist.appendChild(op);
    });

    if (data.dolarVenta) $("fDolarVenta").value = data.dolarVenta;
    if (typeof data.ivaPct === "number") CFG.defaults.ivaPct = data.ivaPct;

    recalcularTodo();
  }

  function onSetSeleccionado() {
    const nombreSet = $("fSet").value;
    if (!excelData || !nombreSet) { recalcularTodo(); return; }
    // El campo ahora es de texto libre con autocompletado (datalist): mientras
    // el usuario todavía está escribiendo o filtrando, el valor no coincide
    // con ningún set real todavía — no tocamos los ítems hasta que elija uno
    // exacto, para no ir vaciando la tabla en cada letra que tipea.
    if (!excelData.setOrder.includes(nombreSet)) { recalcularTodo(); return; }

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
    recalcularTodo();
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
        recalcularTodo();
      });
    });
  }

  function actualizarVisibilidadDescuentos() {
    const esConDesc = ReigerCalc.tieneDescuentoPorCantidad($("fModalidad").value) ||
      ($("fComparar").checked && ReigerCalc.tieneDescuentoPorCantidad($("fModalidadB").value));
    $("bloqueTablaDescuentos").classList.toggle("oculto", !esConDesc);
  }

  // ==========================================================
  // Cálculo y totales en vivo
  // ==========================================================
  // El sufijo permite reutilizar esta misma función para el escenario
  // principal (sin sufijo) y para el escenario de comparación ("B"): los
  // dos comparten cliente, ítems, set, moneda y T.C. — solo cambian
  // modalidad, cantidad de sets y envío, que es justamente lo que se
  // quiere poder comparar.
  function obtenerInputCalculo(sufijo) {
    sufijo = sufijo || "";
    const modalidad = $("fModalidad" + sufijo).value;
    const nombreSet = $("fSet").value;
    const precioUnitarioUSD = excelData && nombreSet
      ? ReigerCalc.precioUnitarioSet(excelData.sets, nombreSet, modalidad)
      : null;

    if (!sufijo) {
      $("fPrecioUnitario").value = precioUnitarioUSD !== null ? precioUnitarioUSD.toFixed(2) : "—";
    }

    return {
      modalidad,
      cantidadSets: Number($("fCantidadSets" + sufijo).value) || 0,
      precioUnitarioUSD,
      tablaDescuentos,
      envioUnitarioUSD: Number($("fEnvioUnitario" + sufijo).value) || 0,
      incluirEnvio: $("fIncluirEnvio" + sufijo).value === "Sí",
      monedaSalida: $("fMoneda").value,
      dolarVenta: Number($("fDolarVenta").value) || 0,
      ivaPct: (excelData && typeof excelData.ivaPct === "number") ? excelData.ivaPct : CFG.defaults.ivaPct,
      baseParaPlanDePago: $("fBasePago").value
    };
  }

  function recalcularTotales(sufijo) {
    sufijo = sufijo || "";
    const input = obtenerInputCalculo(sufijo);
    const c = ReigerCalc.calcular(input);
    const moneda = input.monedaSalida;

    let html = "";
    if (ReigerCalc.tieneDescuentoPorCantidad(input.modalidad) && c.precioValido) {
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
    $("bloqueTotales" + sufijo).innerHTML = html;

    if (!sufijo) {
      $("btnGenerarPdf").disabled = !c.precioValido || !$("fCliente").value.trim();
    }
  }
  function fila(label, valor) {
    return `<div class="fila"><span>${label}</span><span>${valor}</span></div>`;
  }

  // Recalcula el escenario principal y, si el comparador de modalidades
  // está activo, también el escenario B — así no hay que acordarse de
  // llamarlo dos veces en cada listener.
  function recalcularTodo() {
    recalcularTotales();
    if ($("fComparar").checked) recalcularTotales("B");
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
      estado: "GENERADA"
    };
    ReigerHistorial.agregarRegistro(registro);
    $("fNConsulta").value = ReigerHistorial.siguienteNumero();

    alert(`Cotización N° ${numero} generada y descargada como:\n${nombreArchivo}`);
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
        <td>${r.estado || ""}</td>
        <td><button type="button" class="eliminar" data-numero="${r.numero}" title="Eliminar esta cotización del historial">✕</button></td>
      </tr>
    `).join("") || `<tr><td colspan="10" style="text-align:center; color:#999; padding:1.5rem;">Todavía no generaste ninguna cotización.</td></tr>`;

    tbody.querySelectorAll("button.eliminar").forEach(btn => {
      btn.addEventListener("click", () => {
        const numero = Number(btn.dataset.numero);
        if (!confirm(`¿Eliminar la cotización N° ${numero} del historial? Esto no borra el PDF ya descargado, solo el registro.`)) return;
        ReigerHistorial.eliminarRegistro(numero);
        renderHistorial();
      });
    });
  }

  // ---------------- Arranque ----------------
  document.addEventListener("DOMContentLoaded", initPin);
})();
