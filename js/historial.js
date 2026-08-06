/*
  historial.js
  ------------------------------------------------------------------
  Historial de cotizaciones guardado en el propio navegador
  (localStorage). No se sincroniza solo entre dispositivos: si querés
  llevarlo de una PC a otra (o al celular), usá "Exportar a Excel" en
  un lado e "Importar historial" en el otro.

  La numeración es autoincremental y vive acá (no depende de un MAX()
  sobre una lista que se puede desordenar o borrar, como en el Excel).
*/

const ReigerHistorial = (function () {
  const KEY = "reiger_historial_v1";
  const KEY_CONTADOR = "reiger_historial_contador_v1";

  function _leer() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Historial corrupto, se reinicia.", e);
      return [];
    }
  }

  function _guardar(lista) {
    localStorage.setItem(KEY, JSON.stringify(lista));
  }

  function obtenerTodos() {
    return _leer().slice().sort((a, b) => b.numero - a.numero);
  }

  function siguienteNumero() {
    const guardado = Number(localStorage.getItem(KEY_CONTADOR)) || 0;
    const maxEnLista = _leer().reduce((m, r) => Math.max(m, r.numero || 0), 0);
    return Math.max(guardado, maxEnLista) + 1;
  }

  function agregarRegistro(registro) {
    const lista = _leer();
    lista.push(registro);
    _guardar(lista);
    localStorage.setItem(KEY_CONTADOR, String(registro.numero));
    return registro;
  }

  // Borra un registro puntual. El contador de numeración NO se toca,
  // así un número borrado nunca se reutiliza para otra cotización.
  function eliminarRegistro(numero) {
    const lista = _leer().filter(r => r.numero !== numero);
    _guardar(lista);
  }

  // Vacía todo el historial visible. Tampoco toca el contador.
  function vaciarTodo() {
    _guardar([]);
  }

  function exportarXlsx() {
    const lista = obtenerTodos();
    const filas = lista.map(r => ({
      "N° CONSULTA": r.numero,
      "FECHA": r.fecha,
      "CLIENTE": r.cliente,
      "PAÍS": r.pais,
      "MODALIDAD": r.modalidad,
      "SET COTIZADO": r.set,
      "TOTAL": r.total,
      "MONEDA": r.moneda,
      "ESTADO": r.estado || "GENERADA"
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HIST");
    const nombre = `Historial Cotizaciones Reiger - ${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nombre);
  }

  function importarXlsx(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const filas = XLSX.utils.sheet_to_json(ws);
          const existentes = _leer();
          const porNumero = {};
          existentes.forEach(r => porNumero[r.numero] = r);
          filas.forEach(f => {
            const numero = Number(f["N° CONSULTA"]);
            if (!numero) return;
            porNumero[numero] = {
              numero,
              fecha: f["FECHA"] || "",
              cliente: f["CLIENTE"] || "",
              pais: f["PAÍS"] || "",
              modalidad: f["MODALIDAD"] || "",
              set: f["SET COTIZADO"] || "",
              total: Number(f["TOTAL"]) || 0,
              moneda: f["MONEDA"] || "",
              estado: f["ESTADO"] || "GENERADA"
            };
          });
          const fusionado = Object.values(porNumero);
          _guardar(fusionado);
          const maxNum = fusionado.reduce((m, r) => Math.max(m, r.numero || 0), 0);
          localStorage.setItem(KEY_CONTADOR, String(maxNum));
          resolve(fusionado.length);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("No pude leer el archivo de historial."));
      reader.readAsArrayBuffer(file);
    });
  }

  return { obtenerTodos, siguienteNumero, agregarRegistro, eliminarRegistro, vaciarTodo, exportarXlsx, importarXlsx };
})();
