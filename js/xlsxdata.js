/*
  xlsxdata.js
  ------------------------------------------------------------------
  Lee el archivo BASE_DE_DATOS_3.xlsm (o su equivalente .xlsx) en el
  propio navegador con SheetJS y arma las estructuras que usa el resto
  de la app. No sube nada a ningún servidor.

  Hojas que lee:
    - "Precios": SET (col A), Precio venta Argentina (col L),
      Precio venta Sudamérica/exterior (col W), IVA % (M2).
    - "Info": tabla SET / DESCRIPCION / CODIGO (a partir de la fila 19),
      define qué componentes trae cada set.
    - "BASE DE DATOS": código (col A) / descripción (col B).
    - "T.C": dólar venta (C2).

  Nota: se leen los valores ya calculados que Excel dejó guardados en
  el archivo (las fórmulas de costeo de "Precios" no se re-ejecutan acá,
  solo se toma el resultado final de venta). Si el Excel no fue guardado
  con "cálculo automático" activado, esos valores podrían estar desactualizados.
*/

const ReigerXlsx = (function () {

  function colLetterToIndex(letter) {
    // "A" -> 0, "L" -> 11, "W" -> 22, "M" -> 12 ...
    let n = 0;
    for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function cellAt(sheet, colLetter, rowNumber) {
    const addr = colLetter + rowNumber;
    const cell = sheet[addr];
    return cell ? cell.v : undefined;
  }

  function readColumnBlock(sheet, startRow, columnsLetters, maxBlankRows) {
    // Lee filas consecutivas desde startRow, devolviendo un array de objetos
    // { A: valor, L: valor, ... } usando las letras de columna pedidas.
    // Se detiene después de maxBlankRows filas totalmente vacías seguidas.
    const rows = [];
    let blanks = 0;
    let row = startRow;
    const HARD_LIMIT = 5000;
    while (row < startRow + HARD_LIMIT) {
      const obj = {};
      let algo = false;
      for (const col of columnsLetters) {
        const v = cellAt(sheet, col, row);
        obj[col] = v;
        if (v !== undefined && v !== null && String(v).trim() !== "") algo = true;
      }
      if (!algo) {
        blanks++;
        if (blanks >= maxBlankRows) break;
      } else {
        blanks = 0;
        rows.push(obj);
      }
      row++;
    }
    return rows;
  }

  function parsePrecios(wb) {
    const sheet = wb.Sheets["Precios"];
    if (!sheet) throw new Error('No encuentro la hoja "Precios" en el archivo.');
    const ivaPct = Number(cellAt(sheet, "M", 2)) || 0.21;
    const filas = readColumnBlock(sheet, 3, ["A", "L", "W"], 4);
    const sets = {};
    const setOrder = [];
    for (const f of filas) {
      const nombre = (f.A || "").toString().trim();
      if (!nombre) continue;
      const argentina = Number(f.L);
      const exterior = Number(f.W);
      sets[nombre] = {
        argentina: isFinite(argentina) ? argentina : null,
        exterior: isFinite(exterior) ? exterior : null
      };
      setOrder.push(nombre);
    }
    return { sets, setOrder, ivaPct };
  }

  function parseInfo(wb) {
    const sheet = wb.Sheets["Info"];
    if (!sheet) throw new Error('No encuentro la hoja "Info" en el archivo.');
    const filas = readColumnBlock(sheet, 19, ["A", "B", "C"], 6);
    const componentesPorSet = {};
    for (const f of filas) {
      const set = (f.A || "").toString().trim();
      const descripcion = (f.B || "").toString().trim();
      const codigo = (f.C || "").toString().trim();
      if (!set || !codigo) continue;
      if (!componentesPorSet[set]) componentesPorSet[set] = [];
      componentesPorSet[set].push({ codigo, descripcion });
    }
    return componentesPorSet;
  }

  function parseBaseDeDatos(wb) {
    const sheet = wb.Sheets["BASE DE DATOS"];
    if (!sheet) throw new Error('No encuentro la hoja "BASE DE DATOS" en el archivo.');
    const filas = readColumnBlock(sheet, 2, ["A", "B"], 4);
    const codigos = {};
    const codigosList = [];
    for (const f of filas) {
      const codigo = (f.A || "").toString().trim();
      const descripcion = (f.B || "").toString().trim();
      if (!codigo) continue;
      codigos[codigo] = descripcion;
      codigosList.push(codigo);
    }
    return { codigos, codigosList };
  }

  function parseTC(wb) {
    const sheet = wb.Sheets["T.C"];
    if (!sheet) throw new Error('No encuentro la hoja "T.C" en el archivo.');
    const dolarVenta = Number(cellAt(sheet, "C", 2));
    return isFinite(dolarVenta) ? dolarVenta : null;
  }

  function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: "array", cellFormula: false });
    const { sets, setOrder, ivaPct } = parsePrecios(wb);
    const componentesPorSet = parseInfo(wb);
    const { codigos, codigosList } = parseBaseDeDatos(wb);
    const dolarVenta = parseTC(wb);
    return { sets, setOrder, ivaPct, componentesPorSet, codigos, codigosList, dolarVenta };
  }

  function cargarArchivo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = parseWorkbook(e.target.result);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("No pude leer el archivo."));
      reader.readAsArrayBuffer(file);
    });
  }

  return { cargarArchivo, parseWorkbook };
})();
