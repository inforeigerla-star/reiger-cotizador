/*
  sync.js
  ------------------------------------------------------------------
  Sincronización entre dispositivos con Firebase (plan gratis Spark):
  login con Google + Firestore. Sincroniza:
    - historial de cotizaciones de sets   (reiger_historial_v1)
    - historial de repuestos              (reiger_repuestos_historial_v1)
    - estados de cuenta / pagos           (reiger_cuentas_v1)

  Diseño: localStorage sigue siendo lo que lee la app (todo es síncrono y
  funciona sin internet). Este módulo espeja los cambios hacia Firestore y
  trae los de otros dispositivos. Un registro por documento; ante conflicto
  gana el cambio local reciente; si el registro nunca se sincronizó en este
  dispositivo y ya existe en la nube con otro contenido, gana la nube.

  La apiKey de abajo NO es un secreto (es normal que vaya en el código web):
  la seguridad real son las reglas de Firestore, que solo aceptan los emails
  autorizados.
*/

const ReigerSync = (function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD0Hps5bMuJ5aSQoRl1WjYHEsWHt-TvsFA",
    authDomain: "reiger-cotizador.firebaseapp.com",
    projectId: "reiger-cotizador",
    storageBucket: "reiger-cotizador.firebasestorage.app",
    messagingSenderId: "466962915927",
    appId: "1:466962915927:web:7d153270eee7e857173912"
  };

  const COLS = [
    { col: "historial", key: "reiger_historial_v1", tipo: "lista", contador: "reiger_historial_contador_v1" },
    { col: "repuestos", key: "reiger_repuestos_historial_v1", tipo: "lista", contador: "reiger_repuestos_contador_v1" },
    { col: "cuentas", key: "reiger_cuentas_v1", tipo: "mapa" }
  ];
  const KEY_ESTADO = "reiger_sync_estado_v1";

  let db = null, auth = null, usuario = null;
  let suprimir = false;            // true mientras aplicamos datos remotos a localStorage
  let listeners = [];
  const listo = {};                // col -> ya llegó el primer snapshot
  const timers = {};
  let estadoSync = {};             // col -> { mods:{id:ms}, hash:{id:h}, known:{id:true} }
  let chip = null, overlay = null;

  const origSetItem = Storage.prototype.setItem;

  // ---------- utilidades ----------
  function h(str) {                // hash corto (djb2) para detectar cambios locales
    let x = 5381;
    for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
    return String(x);
  }
  function cargarEstado() {
    try { estadoSync = JSON.parse(localStorage.getItem(KEY_ESTADO) || "{}"); } catch (e) { estadoSync = {}; }
    COLS.forEach(c => { estadoSync[c.col] = estadoSync[c.col] || { mods: {}, hash: {}, known: {} }; });
  }
  function guardarEstado() { origSetItem.call(localStorage, KEY_ESTADO, JSON.stringify(estadoSync)); }

  function leerLocal(c) {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(c.key) || (c.tipo === "lista" ? "[]" : "{}")); } catch (e) { raw = c.tipo === "lista" ? [] : {}; }
    if (c.tipo === "mapa") return raw || {};
    const m = {};
    (raw || []).forEach(r => { if (r && r.numero != null) m[r.numero] = r; });
    return m;
  }
  function escribirLocal(c, mapa) {
    const valor = c.tipo === "lista" ? Object.values(mapa) : mapa;
    suprimir = true;
    try {
      origSetItem.call(localStorage, c.key, JSON.stringify(valor));
      if (c.contador) {
        const maxId = Object.keys(mapa).reduce((m, k) => Math.max(m, Number(k) || 0), 0);
        const actual = Number(localStorage.getItem(c.contador)) || 0;
        if (maxId > actual) origSetItem.call(localStorage, c.contador, String(maxId));
      }
    } finally { suprimir = false; }
  }

  // ---------- interfaz: chip de estado + pantalla de login ----------
  function setChip(texto, color) {
    if (!chip) return;
    chip.textContent = texto;
    chip.style.color = color || "#fff";
  }
  function crearChip() {
    if (chip) return;
    chip = document.createElement("button");
    chip.type = "button";
    chip.style.cssText = "background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);border-radius:14px;padding:.25rem .7rem;font-size:.75rem;cursor:pointer;margin-left:.8rem;";
    chip.addEventListener("click", () => {
      if (usuario) {
        if (confirm(`Sesión iniciada como ${usuario.email}.\n¿Cerrar sesión? (los datos quedan en este dispositivo y en la nube)`)) auth.signOut();
      } else {
        mostrarLogin();
      }
    });
    const cont = document.getElementById("contactoHeader");
    (cont ? cont.parentNode : document.body).appendChild(chip);
  }
  function mostrarLogin(mensaje) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(40,10,50,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;";
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:1.6rem;text-align:center;">
          <h2 style="color:#7B2D8B;margin:0 0 .6rem;">Sincronizar datos</h2>
          <p style="font-size:.85rem;color:#555;margin:0 0 1rem;">Iniciá sesión con Google para ver tu historial y estados de cuenta en todos tus dispositivos.</p>
          <div id="syncLoginMsg" style="color:#b3261e;font-size:.8rem;margin-bottom:.8rem;"></div>
          <button type="button" id="syncBtnGoogle" class="btn btn-primario" style="width:100%;margin-bottom:.6rem;">Entrar con Google</button>
          <button type="button" id="syncBtnLocal" class="btn btn-secundario" style="width:100%;">Seguir sin sincronizar (solo este dispositivo)</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#syncBtnGoogle").addEventListener("click", loginGoogle);
      overlay.querySelector("#syncBtnLocal").addEventListener("click", () => { overlay.style.display = "none"; });
    }
    overlay.querySelector("#syncLoginMsg").textContent = mensaje || "";
    overlay.style.display = "flex";
    setChip("☁ Sin sincronizar — tocá para iniciar sesión", "#ffd9a0");
  }
  function ocultarLogin() { if (overlay) overlay.style.display = "none"; }

  async function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        auth.signInWithRedirect(provider);
      } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        mostrarLogin("No se pudo iniciar sesión: " + (e.message || e.code));
      }
    }
  }

  // ---------- sincronización ----------
  function emitirCambio() { window.dispatchEvent(new Event("reiger-sync")); }

  // Primer snapshot (y todos los siguientes): reconcilia remoto vs. local.
  function reconciliar(c, snap) {
    const st = estadoSync[c.col];
    const local = leerLocal(c);
    const remotos = {};
    snap.forEach(d => { const v = d.data(); if (v && v.json) remotos[d.id] = { json: v.json, mod: v.mod || 0 }; });

    let cambioLocal = false;
    const aSubir = [], aBorrarRemoto = [];

    Object.keys(remotos).forEach(id => {
      const r = remotos[id];
      const tieneLocal = Object.prototype.hasOwnProperty.call(local, id);
      if (!tieneLocal) {
        if (st.known[id]) { aBorrarRemoto.push(id); return; }  // lo borré acá y falta propagar
        local[id] = JSON.parse(r.json);                          // registro nuevo de otro dispositivo
        st.mods[id] = r.mod; st.hash[id] = h(JSON.stringify(local[id])); st.known[id] = true;
        cambioLocal = true;
        return;
      }
      const hashLocal = h(JSON.stringify(local[id]));
      const sinCambiosLocales = st.hash[id] === hashLocal;
      const nuncaSincronizado = st.mods[id] === undefined;
      if (r.json === JSON.stringify(local[id])) {                // idénticos: solo registrar
        st.mods[id] = r.mod; st.hash[id] = hashLocal; st.known[id] = true;
      } else if (nuncaSincronizado || (sinCambiosLocales && r.mod > st.mods[id])) {
        local[id] = JSON.parse(r.json);                          // gana la nube
        st.mods[id] = r.mod; st.hash[id] = h(JSON.stringify(local[id])); st.known[id] = true;
        cambioLocal = true;
      } else if (!sinCambiosLocales) {
        aSubir.push(id);                                         // hay cambio local pendiente: gana local
      }
    });

    Object.keys(local).forEach(id => {
      if (remotos[id]) return;
      if (st.known[id]) {                                        // lo borró otro dispositivo
        delete local[id]; delete st.known[id]; delete st.mods[id]; delete st.hash[id];
        cambioLocal = true;
      } else {
        aSubir.push(id);                                         // nuevo local
      }
    });

    if (cambioLocal) { escribirLocal(c, local); }
    guardarEstado();
    listo[c.col] = true;
    if (cambioLocal) emitirCambio();
    if (aSubir.length || aBorrarRemoto.length) empujar(c, aBorrarRemoto);
    else setChip(`☁ Sincronizado (${usuario.email})`, "#bff0c4");
  }

  // Sube lo que cambió localmente y borra lo que se eliminó localmente.
  async function empujar(c, extraBorrar) {
    if (!usuario || !listo[c.col]) return;
    const st = estadoSync[c.col];
    const local = leerLocal(c);
    const ops = [];
    Object.keys(local).forEach(id => {
      const json = JSON.stringify(local[id]);
      const hh = h(json);
      if (st.hash[id] !== hh) ops.push({ tipo: "set", id, json, hh });
    });
    Object.keys(st.known).forEach(id => { if (!Object.prototype.hasOwnProperty.call(local, id)) ops.push({ tipo: "del", id }); });
    (extraBorrar || []).forEach(id => { if (!ops.find(o => o.id === id)) ops.push({ tipo: "del", id }); });
    if (!ops.length) return;

    setChip("☁ Sincronizando…", "#fff");
    try {
      for (let i = 0; i < ops.length; i += 400) {   // límite de 500 por lote
        const batch = db.batch();
        ops.slice(i, i + 400).forEach(o => {
          const ref = db.collection(c.col).doc(String(o.id));
          if (o.tipo === "set") batch.set(ref, { json: o.json, mod: Date.now() });
          else batch.delete(ref);
        });
        await batch.commit();
      }
      const ahora = Date.now();
      ops.forEach(o => {
        if (o.tipo === "set") { st.hash[o.id] = o.hh; st.mods[o.id] = ahora; st.known[o.id] = true; }
        else { delete st.known[o.id]; delete st.mods[o.id]; delete st.hash[o.id]; }
      });
      guardarEstado();
      setChip(`☁ Sincronizado (${usuario.email})`, "#bff0c4");
    } catch (e) {
      console.error("Sync: error al subir", c.col, e);
      setChip("⚠ Error al sincronizar — se reintenta", "#ffb4ab");
    }
  }

  function programarEmpuje(c) {
    if (!usuario || !listo[c.col]) return;
    clearTimeout(timers[c.col]);
    timers[c.col] = setTimeout(() => empujar(c), 600);
  }

  // Cualquier escritura local a las claves vigiladas dispara una subida.
  function vigilarLocalStorage() {
    Storage.prototype.setItem = function (k, v) {
      origSetItem.call(this, k, v);
      if (this === window.localStorage && !suprimir) {
        const c = COLS.find(x => x.key === k);
        if (c) programarEmpuje(c);
      }
    };
  }

  function empezar() {
    cargarEstado();
    ocultarLogin();
    setChip("☁ Sincronizando…", "#fff");
    COLS.forEach(c => { listo[c.col] = false; });
    listeners = COLS.map(c =>
      db.collection(c.col).onSnapshot(
        snap => { if (!snap.metadata.hasPendingWrites) reconciliar(c, snap); },
        err => {
          console.error("Sync: error de lectura", c.col, err);
          const sinPermiso = err && err.code === "permission-denied";
          setChip(sinPermiso ? `⚠ ${usuario.email} no tiene permiso` : "⚠ Sin conexión con la nube", "#ffb4ab");
        }
      )
    );
  }

  function detener() {
    listeners.forEach(u => { try { u(); } catch (e) {} });
    listeners = [];
    COLS.forEach(c => { listo[c.col] = false; });
  }

  function init() {
    crearChip();
    if (typeof firebase === "undefined") {
      setChip("☁ Sin sincronización (no se pudo cargar Firebase)", "#ffd9a0");
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    auth = firebase.auth();
    vigilarLocalStorage();
    auth.getRedirectResult().catch(e => mostrarLogin("No se pudo iniciar sesión: " + (e.message || e.code)));
    auth.onAuthStateChanged(user => {
      usuario = user;
      if (user) empezar();
      else { detener(); mostrarLogin(); }
    });
  }

  return { init };
})();
