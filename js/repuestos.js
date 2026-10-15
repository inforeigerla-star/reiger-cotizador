/*
  repuestos.js
  ------------------------------------------------------------------
  Pestaña "Repuestos (manual)": cotización armada a mano (código,
  descripción, cantidad y precio unitario de cada repuesto), sin leer
  nada del Excel. Misma estética y mismo PDF que la cotización de sets,
  pero con envío y costo de transferencia bancaria editables (con
  valores por defecto en config.js) y la leyenda de Duty bajo los ítems.

  Tiene su propio historial (localStorage), separado del de sets, con su
  propia numeración. Todo en USD.
*/

const ReigerRepuestos = (function () {
  const KEY = "reiger_repuestos_historial_v1";
  const KEY_CONTADOR = "reiger_repuestos_contador_v1";

  let items = [];
  let iniciado = false;

  const $ = (id) => document.getElementById(id);
  const num = (v) => Number(v) || 0;
  const fmtUsd = (v) => ReigerCalc.formatoMoneda(v, "USD");
  // Formatea un monto en USD en la moneda de salida elegida (USD o ARS al T.C. cargado).
  const fmt = (v) => { const m = monedaYFactor(); return ReigerCalc.formatoMoneda(v * m.factor, m.moneda); };
  function monedaYFactor() {
    const moneda = $("rpMoneda") ? $("rpMoneda").value : "USD";
    const tc = $("rpTC") ? num($("rpTC").value) : 0;
    return { moneda, tc, factor: moneda === "ARS" ? tc : 1 };
  }
  const cfgRep = () => (window.REIGER_CONFIG.repuestos || {});

  function escapeAttr(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // ---------------- Historial propio ----------------
  function leer() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function guardar(lista) { localStorage.setItem(KEY, JSON.stringify(lista)); }
  function obtenerTodos() { return leer().slice().sort((a, b) => b.numero - a.numero); }
  function siguienteNumero() {
    const guardado = Number(localStorage.getItem(KEY_CONTADOR)) || 0;
    const maxEnLista = leer().reduce((m, r) => Math.max(m, r.numero || 0), 0);
    return Math.max(guardado, maxEnLista) + 1;
  }
  function agregarRegistro(reg) {
    const lista = leer();
    lista.push(reg);
    guardar(lista);
    localStorage.setItem(KEY_CONTADOR, String(reg.numero));
  }
  function eliminarRegistro(numero) {
    guardar(leer().filter(r => r.numero !== numero));
  }

  // ---------------- Cálculo ----------------
  function calcular() {
    const subtotal = items.reduce((s, it) => s + num(it.cantidad) * num(it.precio), 0);
    const envio = num($("rpEnvio").value);
    const transf = num($("rpTransf").value);
    const m = monedaYFactor();
    const aplicaIva = $("rpIva").value === "si";
    const ivaPct = (window.REIGER_CONFIG.defaults.ivaPct) || 0.21;
    // El IVA se calcula solo sobre los repuestos (no sobre envío ni transferencia).
    const iva = aplicaIva ? subtotal * ivaPct : 0;
    return {
      subtotal, envio, transf, iva, aplicaIva, ivaPct,
      moneda: m.moneda, tc: m.tc, factor: m.factor,
      total: subtotal + iva + envio + transf
    };
  }

  function itemsValidos() {
    return items.filter(it => (it.codigo || it.descripcion) && num(it.cantidad) > 0);
  }

  function renderTotales() {
    const c = calcular();
    const ars = c.moneda === "ARS";
    $("rpTotales").innerHTML =
      `<div class="fila"><span>Subtotal repuestos${c.aplicaIva ? " (sin IVA)" : ""}:</span><span>${fmt(c.subtotal)}</span></div>` +
      (c.aplicaIva ? `<div class="fila"><span>IVA (${Math.round(c.ivaPct * 100)}%):</span><span>${fmt(c.iva)}</span></div>` : "") +
      `<div class="fila"><span>Envío (estimado):</span><span>${fmt(c.envio)}</span></div>` +
      `<div class="fila"><span>Costo por transferencia bancaria:</span><span>${fmt(c.transf)}</span></div>` +
      `<div class="fila final"><span>PRECIO TOTAL${c.aplicaIva ? " (con IVA)" : ""}:</span><span>${fmt(c.total)}</span></div>` +
      (ars && !(c.tc > 0) ? `<div class="aviso" style="margin-top:.5rem; color:#b3261e;">Cargá un tipo de cambio mayor a 0.</div>` : "");
    $("rpTablaItems").classList.toggle("ars", ars);
    $("rpBtnPdf").disabled = !$("rpCliente").value.trim() || !itemsValidos().length || (ars && !(c.tc > 0));
  }

  // ---------------- Ítems ----------------
  function maxItems() { return cfgRep().maxItems || 25; }

  function renderItems() {
    const tbody = $("rpTbodyItems");
    tbody.innerHTML = "";
    items.forEach((it, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:center; color:#999;">${idx + 1}</td>
        <td class="col-codigo"><input type="text" value="${escapeAttr(it.codigo)}" data-idx="${idx}" data-campo="codigo"></td>
        <td><input type="text" value="${escapeAttr(it.descripcion)}" data-idx="${idx}" data-campo="descripcion"></td>
        <td class="col-cant"><input type="number" min="1" max="999" value="${it.cantidad}" data-idx="${idx}" data-campo="cantidad"></td>
        <td class="col-precio"><input type="number" min="0" step="0.01" value="${it.precio === "" ? "" : it.precio}" data-idx="${idx}" data-campo="precio"></td>
        <td class="col-conv" id="rpConv${idx}">${fmt(num(it.precio))}</td>
        <td class="col-sub" id="rpSub${idx}">${fmt(num(it.cantidad) * num(it.precio))}</td>
        <td><button type="button" class="quitar" data-idx="${idx}" title="Quitar ítem">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("input").forEach(inp => inp.addEventListener("input", onItemInput));
    tbody.querySelectorAll("button.quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        items.splice(Number(btn.dataset.idx), 1);
        if (!items.length) items.push(itemVacio());
        renderItems();
        renderTotales();
      });
    });
    $("rpContador").textContent = `${items.length} / ${maxItems()} ítems`;
    $("rpBtnAgregar").disabled = items.length >= maxItems();
  }

  function itemVacio() { return { codigo: "", descripcion: "", cantidad: 1, precio: "" }; }

  function onItemInput(e) {
    const idx = Number(e.target.dataset.idx);
    const campo = e.target.dataset.campo;
    if (!items[idx]) return;
    items[idx][campo] = (campo === "cantidad" || campo === "precio") ? e.target.value : e.target.value;
    const sub = $("rpSub" + idx);
    if (sub) sub.textContent = fmt(num(items[idx].cantidad) * num(items[idx].precio));
    const conv = $("rpConv" + idx);
    if (conv) conv.textContent = fmt(num(items[idx].precio));
    renderTotales();
  }

  // ---------------- PDF ----------------
  function generarPdf() {
    const CFG = window.REIGER_CONFIG;
    const cliente = $("rpCliente").value.trim();
    const validos = itemsValidos();
    if (!cliente) { alert("Falta el nombre del cliente."); return; }
    if (!validos.length) { alert("Cargá al menos un repuesto (código o descripción, con cantidad)."); return; }

    const c = calcular();
    const numero = siguienteNumero();
    const itemsPdf = validos.map(it => ({
      codigo: it.codigo, descripcion: it.descripcion,
      cantidad: num(it.cantidad), precio: num(it.precio)
    }));

    const datos = {
      numero, cliente,
      direccion: $("rpDireccion").value.trim(),
      ciudad: $("rpCiudad").value.trim(),
      pais: $("rpPais").value,
      condPago: $("rpCondPago").value,
      fecha: $("rpFecha").value,
      validez: $("rpValidez").value,
      incoterm: $("rpIncoterm").value,
      items: itemsPdf,
      subtotal: c.subtotal, envio: c.envio, transf: c.transf, total: c.total,
      moneda: c.moneda, tc: c.tc, factor: c.factor,
      aplicaIva: c.aplicaIva, ivaPct: c.ivaPct, iva: c.iva,
      leyenda: cfgRep().leyendaDuty || "Duty a cargo del cliente.",
      contacto: CFG.contacto,
      notas: CFG.notas
    };

    const doc = ReigerPdf.generarRepuestos(datos);
    const nombre = ReigerPdf.nombreArchivoRepuestos(numero, cliente);
    doc.save(nombre);

    agregarRegistro({
      numero,
      fecha: datos.fecha,
      cliente,
      pais: datos.pais,
      cantItems: itemsPdf.length,
      total: Number((c.total * c.factor).toFixed(2)),   // en la moneda de salida
      moneda: c.moneda,
      snapshot: {
        moneda: c.moneda, tc: c.tc, aplicaIva: c.aplicaIva,   // los precios de los ítems siempre quedan en USD
        cliente, direccion: datos.direccion, ciudad: datos.ciudad, pais: datos.pais,
        condPago: datos.condPago, fecha: datos.fecha, validez: datos.validez,
        incoterm: datos.incoterm, envio: c.envio, transf: c.transf,
        items: itemsPdf.map(it => Object.assign({}, it))
      }
    });
    $("rpNConsulta").value = siguienteNumero();
    alert(`Cotización de repuestos N° ${numero} generada y descargada como:\n${nombre}`);
  }

  // ---------------- Historial (modal) ----------------
  function renderHistorial() {
    const tbody = $("rpTbodyHistorial");
    const lista = obtenerTodos();
    tbody.innerHTML = lista.map(r => `
      <tr>
        <td><span class="badge">${r.numero}</span></td>
        <td>${r.fecha || ""}</td>
        <td>${escapeAttr(r.cliente)}</td>
        <td>${r.pais || ""}</td>
        <td>${r.cantItems ?? ""}</td>
        <td>${(r.total ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
        <td>${r.moneda || "USD"}</td>
        <td>
          <button type="button" class="editar-cot" data-numero="${r.numero}" title="Cargar en el formulario (genera una cotización nueva)">✎</button>
          <button type="button" class="eliminar" data-numero="${r.numero}" title="Eliminar del historial">✕</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="8" style="text-align:center; color:#999; padding:1.5rem;">Todavía no generaste ninguna cotización de repuestos.</td></tr>`;

    tbody.querySelectorAll("button.eliminar").forEach(btn => {
      btn.addEventListener("click", () => {
        const n = Number(btn.dataset.numero);
        if (!confirm(`¿Eliminar la cotización de repuestos N° ${n} del historial? Esto no borra el PDF ya descargado.`)) return;
        eliminarRegistro(n);
        renderHistorial();
      });
    });
    tbody.querySelectorAll("button.editar-cot").forEach(btn => {
      btn.addEventListener("click", () => cargarParaEditar(Number(btn.dataset.numero)));
    });
  }

  function cargarParaEditar(numero) {
    const reg = leer().find(r => r.numero === numero);
    if (!reg || !reg.snapshot) return;
    const s = reg.snapshot;
    $("rpCliente").value = s.cliente || "";
    $("rpDireccion").value = s.direccion || "";
    $("rpCiudad").value = s.ciudad || "";
    $("rpPais").value = s.pais || $("rpPais").value;
    $("rpCondPago").value = s.condPago || "Transferencia";
    $("rpFecha").value = s.fecha || "";
    $("rpValidez").value = s.validez || "";
    $("rpIncoterm").value = s.incoterm || "EXW";
    $("rpEnvio").value = s.envio ?? 0;
    $("rpTransf").value = s.transf ?? 0;
    // Presupuestos hechos antes de existir pesos/IVA no traen estos datos:
    // se cargan en USD y sin IVA (como se emitieron) y se pueden cambiar.
    $("rpMoneda").value = s.moneda || "USD";
    if (s.tc) $("rpTC").value = s.tc;
    $("rpIva").value = s.aplicaIva ? "si" : "no";
    items = (s.items || []).map(it => Object.assign({}, it));
    if (!items.length) items.push(itemVacio());
    renderItems();
    renderTotales();
    $("modalHistorialRep").classList.add("oculto");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------- Pestañas ----------------
  function mostrarVista(cual) {
    const esRep = cual === "repuestos";
    $("vistaSets").classList.toggle("oculto", esRep);
    $("vistaRepuestos").classList.toggle("oculto", !esRep);
    $("tabSets").classList.toggle("activa", !esRep);
    $("tabRepuestos").classList.toggle("activa", esRep);
    // El dólar oficial de la pestaña Sets llega con retraso (API): si todavía
    // no hay T.C. cargado acá, se toma de ahí al entrar a Repuestos.
    if (esRep && !num($("rpTC").value)) {
      const tcSets = num($("fDolarVenta").value);
      if (tcSets > 0) { $("rpTC").value = tcSets; renderItems(); renderTotales(); }
    }
  }

  // ---------------- Init ----------------
  function init() {
    if (iniciado) return;
    iniciado = true;
    const CFG = window.REIGER_CONFIG;

    $("tabSets").addEventListener("click", () => mostrarVista("sets"));
    $("tabRepuestos").addEventListener("click", () => mostrarVista("repuestos"));

    const sel = $("rpPais");
    CFG.paises.forEach(p => {
      const op = document.createElement("option");
      op.value = p; op.textContent = p;
      sel.appendChild(op);
    });

    $("rpFecha").valueAsDate = new Date();
    $("rpValidez").value = CFG.defaults.validez;
    $("rpIncoterm").value = CFG.defaults.incoterm;
    $("rpCondPago").value = CFG.defaults.condPago;
    $("rpEnvio").value = cfgRep().envioUSD ?? 0;
    $("rpTransf").value = cfgRep().transferenciaUSD ?? 0;
    $("rpNConsulta").value = siguienteNumero();
    $("rpLeyenda").textContent = cfgRep().leyendaDuty || "Duty a cargo del cliente.";

    items = [itemVacio()];
    renderItems();
    renderTotales();

    ["rpCliente", "rpEnvio", "rpTransf", "rpIva"].forEach(id => $(id).addEventListener("input", renderTotales));
    // Al cambiar moneda o T.C. se redibujan también los importes de cada ítem.
    ["rpMoneda", "rpTC"].forEach(id => $(id).addEventListener("input", () => { renderItems(); renderTotales(); }));

    // T.C. inicial: el que ya tenga la pestaña Sets (dólar oficial) y botón ⟳ propio.
    const tcSets = Number(document.getElementById("fDolarVenta").value);
    if (tcSets > 0) $("rpTC").value = tcSets;
    $("rpBtnTC").addEventListener("click", async () => {
      const estado = $("rpTCEstado");
      estado.textContent = "Actualizando…";
      try {
        const resp = await fetch("https://dolarapi.com/v1/dolares/oficial");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        if (typeof data.venta !== "number") throw new Error("Respuesta inesperada");
        $("rpTC").value = data.venta;
        estado.textContent = "Dólar oficial (venta) de DolarAPI";
        renderItems(); renderTotales();
      } catch (e) {
        estado.textContent = "No se pudo actualizar. Cargalo a mano.";
      }
    });
    $("rpBtnAgregar").addEventListener("click", () => {
      if (items.length >= maxItems()) return;
      items.push(itemVacio());
      renderItems();
      renderTotales();
    });
    $("rpBtnPdf").addEventListener("click", generarPdf);
    $("rpBtnHistorial").addEventListener("click", () => {
      renderHistorial();
      $("modalHistorialRep").classList.remove("oculto");
    });
    window.addEventListener("reiger-sync", () => {
      $("rpNConsulta").value = siguienteNumero();
      if (!$("modalHistorialRep").classList.contains("oculto")) renderHistorial();
    });
    $("rpBtnCerrarHistorial").addEventListener("click", () => $("modalHistorialRep").classList.add("oculto"));
  }

  return { init };
})();
