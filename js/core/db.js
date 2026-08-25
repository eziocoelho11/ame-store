// db.js — camada fina sobre o IndexedDB.
// Duas colecoes apenas:
//   eventos — o log append-only (fonte da verdade)
//   meta    — chave/valor para configuracao tecnica (token, estado de sincronia, snapshot)
// Sem biblioteca: o IndexedDB e' verboso, mas e' nativo em todo navegador
// desde 2013 e nao tem como "sair do ar" nem virar assinatura.

const NOME_DB = 'ame-store';
const VERSAO = 1;

let _db = null;

export function abrirDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_DB, VERSAO);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('eventos')) {
        const s = db.createObjectStore('eventos', { keyPath: 'id' });
        s.createIndex('ts', 'ts');
        s.createIndex('deviceId', 'deviceId');
        s.createIndex('sincronizado', 'sincronizado');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'chave' });
      }
      void ev;
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, modo) {
  return abrirDB().then((db) => db.transaction(store, modo).objectStore(store));
}

function pedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- eventos ----------

/** Grava eventos. Ignora silenciosamente ids que ja existem (idempotente — essencial na sincronia). */
export async function gravarEventos(eventos) {
  if (!eventos.length) return 0;
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('eventos', 'readwrite');
    const store = t.objectStore('eventos');
    let novos = 0;
    let pendentes = eventos.length;
    for (const ev of eventos) {
      const req = store.add(ev);
      req.onsuccess = () => { novos++; if (--pendentes === 0) {} };
      req.onerror = (e) => { e.preventDefault(); if (--pendentes === 0) {} }; // ja existia
    }
    t.oncomplete = () => resolve(novos);
    t.onerror = () => reject(t.error);
  });
}

/** Todos os eventos, em ordem de id (que e' ordem de tempo). */
export async function lerEventos() {
  const store = await tx('eventos', 'readonly');
  return pedido(store.getAll());
}

/** Eventos ainda nao enviados para o repositorio de sincronia. */
export async function eventosPendentes() {
  const todos = await lerEventos();
  return todos.filter((e) => !e.sincronizado);
}

/** Marca eventos como ja enviados. */
export async function marcarSincronizados(ids) {
  if (!ids.length) return;
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('eventos', 'readwrite');
    const store = t.objectStore('eventos');
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const ev = req.result;
        if (ev && !ev.sincronizado) { ev.sincronizado = 1; store.put(ev); }
      };
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function contarEventos() {
  const store = await tx('eventos', 'readonly');
  return pedido(store.count());
}

// ---------- meta ----------

export async function getMeta(chave, padrao = null) {
  const store = await tx('meta', 'readonly');
  const r = await pedido(store.get(chave));
  return r === undefined ? padrao : r.valor;
}

export async function setMeta(chave, valor) {
  const store = await tx('meta', 'readwrite');
  return pedido(store.put({ chave, valor }));
}

export async function delMeta(chave) {
  const store = await tx('meta', 'readwrite');
  return pedido(store.delete(chave));
}

/** Apaga tudo. So e' chamado a partir de Ajustes, com dupla confirmacao. */
export async function apagarTudo() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['eventos', 'meta'], 'readwrite');
    t.objectStore('eventos').clear();
    t.objectStore('meta').clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Espaco usado, quando o navegador informa. */
export async function usoDeArmazenamento() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}

/** Pede ao navegador para nao descartar os dados sob pressao de espaco. */
export async function pedirPersistencia() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}
