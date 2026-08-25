// eventlog.js — a unica porta de entrada para mudar qualquer dado.
// Nenhuma tela escreve no estado: toda tela chama registrar(tipo, dados).

import * as db from './db.js';
import { novoId, deviceId, deviceNome } from './id.js';
import { construir, aplicar, estadoInicial } from './state.js';

const VERSAO_EVENTO = 1;

let _estado = estadoInicial();
let _eventos = [];
let _ouvintes = new Set();
let _carregado = false;

export function estado() { return _estado; }
export function eventos() { return _eventos; }
export function carregado() { return _carregado; }

/** Assina mudancas de estado. Devolve a funcao para cancelar. */
export function assinar(fn) {
  _ouvintes.add(fn);
  return () => _ouvintes.delete(fn);
}

function notificar(motivo) {
  for (const fn of _ouvintes) {
    try { fn(_estado, motivo); } catch (err) { console.error('ouvinte falhou', err); }
  }
}

/** Le o log do IndexedDB e reconstroi o estado. Chamado uma vez no boot. */
export async function carregar() {
  _eventos = await db.lerEventos();
  _eventos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  _estado = construir(_eventos);
  _carregado = true;
  notificar('carga');
  return _estado;
}

/**
 * Grava um fato novo. Devolve o evento criado.
 * O estado e' atualizado na hora (aplicacao incremental), sem replay completo.
 */
export async function registrar(tipo, dados) {
  const ev = {
    id: novoId(),
    ts: Date.now(),
    deviceId: deviceId(),
    deviceNome: deviceNome(),
    tipo,
    dados,
    v: VERSAO_EVENTO,
    sincronizado: 0,
  };
  await db.gravarEventos([ev]);
  _eventos.push(ev);
  aplicar(_estado, ev);
  notificar(tipo);
  agendarSincronia();
  return ev;
}

/** Grava varios fatos de uma vez (ex.: criar produto + suas variantes). */
export async function registrarVarios(lista) {
  const agora = Date.now();
  const dev = deviceId();
  const nome = deviceNome();
  const evs = lista.map(({ tipo, dados }) => ({
    id: novoId(), ts: agora, deviceId: dev, deviceNome: nome, tipo, dados,
    v: VERSAO_EVENTO, sincronizado: 0,
  }));
  await db.gravarEventos(evs);
  for (const ev of evs) { _eventos.push(ev); aplicar(_estado, ev); }
  notificar('lote');
  agendarSincronia();
  return evs;
}

/**
 * Absorve eventos vindos de fora (sincronia ou restauracao de backup).
 * Eventos antigos podem chegar depois dos novos, entao aqui o replay e' completo:
 * e' o que garante que o custo medio e os saldos fiquem coerentes.
 */
export async function importar(eventosExternos, { jaSincronizados = true } = {}) {
  const conhecidos = new Set(_eventos.map((e) => e.id));
  const novos = eventosExternos
    .filter((e) => e && e.id && !conhecidos.has(e.id))
    .map((e) => ({ ...e, sincronizado: jaSincronizados ? 1 : 0 }));
  if (!novos.length) return 0;
  await db.gravarEventos(novos);
  _eventos = _eventos.concat(novos);
  _eventos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  _estado = construir(_eventos);
  notificar('importacao');
  return novos.length;
}

// ---------- integracao com a sincronia (registrada por sync.js) ----------

let _gatilhoSincronia = null;
let _timer = null;

export function definirGatilhoSincronia(fn) { _gatilhoSincronia = fn; }

/**
 * Sincroniza pouco depois da ultima gravacao, para nao subir um arquivo por
 * clique. Sao poucos segundos: quanto menor a espera, mais rapido o lancamento
 * aparece nos outros aparelhos; quanto maior, menos gravacoes no repositorio.
 * Seis segundos cobre o intervalo entre itens de uma mesma venda.
 */
function agendarSincronia() {
  if (!_gatilhoSincronia) return;
  clearTimeout(_timer);
  _timer = setTimeout(() => { try { _gatilhoSincronia(); } catch (e) { console.warn(e); } }, 6000);
}

/** Forca o envio agora (botao "sincronizar" e ao fechar o app). */
export function sincronizarAgora() {
  clearTimeout(_timer);
  if (_gatilhoSincronia) return _gatilhoSincronia();
  return Promise.resolve();
}

// ---------- backup ----------

/** Backup completo: o log inteiro. Restaurar isto reconstroi tudo, bit a bit. */
export function exportarBackup() {
  return {
    formato: 'ame-store-backup',
    versao: 1,
    geradoEm: new Date().toISOString(),
    aparelho: deviceNome(),
    totalEventos: _eventos.length,
    eventos: _eventos.map(({ sincronizado, ...resto }) => resto),
  };
}

export async function restaurarBackup(obj) {
  if (!obj || obj.formato !== 'ame-store-backup' || !Array.isArray(obj.eventos)) {
    throw new Error('Arquivo não é um backup válido da AME Store.');
  }
  return importar(obj.eventos, { jaSincronizados: false });
}

/** Zera o aparelho. So' de Ajustes, com dupla confirmacao. */
export async function apagarTudo() {
  await db.apagarTudo();
  _eventos = [];
  _estado = estadoInicial();
  notificar('reset');
}
