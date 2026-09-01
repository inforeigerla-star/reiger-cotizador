/*
  cuentas.js
  ------------------------------------------------------------------
  Estado de cuenta por cotización CONFIRMADA: registra los pagos que
  va haciendo el cliente (fecha, monto, medio, nota) y calcula el
  saldo pendiente. Vive en este mismo navegador (localStorage), igual
  que el historial — no hay backend ni sincronización entre
  dispositivos.

  Los pagos se cargan siempre en la misma moneda que el total de la
  cotización (no se hacen conversiones acá).
*/

const ReigerCuentas = (function () {
  const KEY = "reiger_cuentas_v1";

  function _leer() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("Estados de cuenta corruptos, se reinicia.", e);
      return {};
    }
  }

  function _guardar(mapa) {
    localStorage.setItem(KEY, JSON.stringify(mapa));
  }

  // Crea (si no existe todavía) el estado de cuenta de una cotización a
  // partir de su registro de historial. Si ya existía (por ej. se le dio
  // "Confirmar" dos veces), lo devuelve tal cual — nunca pisa pagos ya
  // cargados.
  function confirmar(registroHistorial) {
    const mapa = _leer();
    const numero = registroHistorial.numero;
    if (!mapa[numero]) {
      mapa[numero] = {
        numero,
        cliente: registroHistorial.cliente,
        pais: registroHistorial.pais,
        set: registroHistorial.set,
        modalidad: registroHistorial.modalidad,
        moneda: registroHistorial.moneda,
        total: registroHistorial.total,
        fechaCotizacion: registroHistorial.fecha,
        fechaConfirmacion: new Date().toISOString().slice(0, 10),
        pagos: []
      };
      _guardar(mapa);
    }
    return mapa[numero];
  }

  function obtener(numero) {
    const mapa = _leer();
    return mapa[numero] || null;
  }

  function agregarPago(numero, pago) {
    const mapa = _leer();
    if (!mapa[numero]) return null;
    mapa[numero].pagos.push(pago);
    mapa[numero].pagos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    _guardar(mapa);
    return mapa[numero];
  }

  function eliminarPago(numero, idxPago) {
    const mapa = _leer();
    if (!mapa[numero]) return null;
    mapa[numero].pagos.splice(idxPago, 1);
    _guardar(mapa);
    return mapa[numero];
  }

  // Total pagado y saldo pendiente a partir de los pagos cargados.
  function calcularSaldo(cuenta) {
    const totalPagado = (cuenta.pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const saldoPendiente = (Number(cuenta.total) || 0) - totalPagado;
    return { totalPagado, saldoPendiente };
  }

  return { confirmar, obtener, agregarPago, eliminarPago, calcularSaldo };
})();
