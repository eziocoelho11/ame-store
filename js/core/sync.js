// sync.js — sincronia entre aparelhos usando um repositorio PRIVADO do GitHub
// como caixa postal. Sem servidor, sem mensalidade, e com historico: cada
// gravacao vira um commit, entao da' para voltar no tempo.
//
// Regra que elimina conflito: cada aparelho escreve SO' o proprio arquivo
//   eventos/{aparelho}/{AAAA-MM}.jsonl
// Dois aparelhos nunca disputam a mesma linha. Juntar e' so' unir os arquivos —
// e como cada evento tem id unico, evento repetido e' descartado sozinho.

import * as db from './db.js';
import * as log from './eventlog.js';
import { deviceId } from './id.js';

const API = 'https://api.github.com';

let cfg = { repo: '', token: '', ramo: 'main' };
let shas = {};           // caminho -> sha conhecido
let ultima = null;
let emAndamento = null;

export async function iniciar() {
  cfg = (await db.getMeta('sync.config')) || { repo: '', token: '', ramo: 'main' };
  shas = (await db.getMeta('sync.shas')) || {};
  ultima = await db.getMeta('sync.ultima');
}

export function estadoSincronia() {
  return { configurada: !!(cfg.repo && cfg.token), repo: cfg.repo, ramo: cfg.ramo, ultima };
}

export function configuracao() {
  return { ...cfg };
}

export async function salvarConfiguracao(nova) {
  cfg = { repo: (nova.repo || '').trim(), token: (nova.token || '').trim(), ramo: (nova.ramo || 'main').trim() };
  await db.setMeta('sync.config', cfg);
  return cfg;
}

export async function desligar() {
  cfg = { repo: '', token: '', ramo: 'main' };
  shas = {};
  await db.setMeta('sync.config', cfg);
  await db.setMeta('sync.shas', shas);
}

// ---------------- base64 com acento ----------------

function paraBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(bin);
}

function deBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------------- chamadas a API ----------------

async function api(caminho, opcoes = {}) {
  const resp = await fetch(API + caminho, {
    ...opcoes,
    headers: {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opcoes.headers || {}),
    },
  });
  if (resp.status === 404) return { naoExiste: true, status: 404 };
  if (!resp.ok) {
    let detalhe = '';
    try { detalhe = (await resp.json()).message || ''; } catch { /* corpo vazio */ }
    const erro = new Error(mensagemAmigavel(resp.status, detalhe));
    erro.status = resp.status;
    throw erro;
  }
  if (resp.status === 204) return {};
  return resp.json();
}

function mensagemAmigavel(status, detalhe) {
  if (status === 401) return 'Token do GitHub inválido ou expirado. Gere um novo e atualize em Ajustes › Sincronia.';
  if (status === 403) return 'O GitHub recusou o acesso. Confira se o token tem permissão Contents: Read and write neste repositório. ' + detalhe;
  if (status === 404) return 'Repositório não encontrado. Confira o nome (usuario/repositorio) e se o token dá acesso a ele.';
  if (status === 409 && /empty/i.test(detalhe)) return 'O repositório de dados ainda está vazio — não há nada para receber.';
  if (status === 409 || status === 422) return 'Outro aparelho gravou neste arquivo ao mesmo tempo. ' + detalhe;
  return `GitHub respondeu ${status}. ${detalhe}`;
}

/** Testa repo e token, sem gravar nada. */
export async function testarConexao(repo, token, ramo = 'main') {
  const antes = { ...cfg };
  cfg = { repo: repo.trim(), token: token.trim(), ramo: ramo.trim() || 'main' };
  try {
    const r = await api(`/repos/${cfg.repo}`);
    if (r.naoExiste) throw new Error('Repositório não encontrado. Confira o nome no formato usuario/repositorio e se o token tem acesso a ele.');
    if (!r.permissions || !r.permissions.push) {
      throw new Error('O token não tem permissão de escrita neste repositório.');
    }
    return { ok: true, privado: r.private, nome: r.full_name, ramoPadrao: r.default_branch };
  } finally {
    cfg = antes;
  }
}

// ---------------- puxar ----------------

function mesDoEvento(ev) {
  const d = new Date(ev.ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function serializar(eventos) {
  return eventos
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ sincronizado, ...resto }) => JSON.stringify(resto))
    .join('\n') + '\n';
}

function desserializar(texto) {
  const saida = [];
  for (const linha of texto.split('\n')) {
    const s = linha.trim();
    if (!s) continue;
    try { saida.push(JSON.parse(s)); }
    catch { console.warn('linha ilegível no log remoto, ignorada'); }
  }
  return saida;
}

async function puxar() {
  let arvore;
  try {
    arvore = await api(`/repos/${cfg.repo}/git/trees/${encodeURIComponent(cfg.ramo)}?recursive=1`);
  } catch (err) {
    // Repositorio recem-criado, sem nenhum commit: o GitHub responde 409
    // "Git Repository is empty". Isso nao e' erro — e' so' nao haver nada a
    // puxar ainda. O primeiro envio adiante cria o commit inicial.
    if (err.status === 409) return 0;
    throw err;
  }
  if (arvore.naoExiste) return 0; // o ramo ainda nao existe

  const arquivos = (arvore.tree || []).filter(
    (n) => n.type === 'blob' && n.path.startsWith('eventos/') && n.path.endsWith('.jsonl')
  );

  let importados = 0;
  for (const arq of arquivos) {
    if (shas[arq.path] === arq.sha) continue; // inalterado desde a ultima vez
    const conteudo = await api(`/repos/${cfg.repo}/contents/${arq.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(cfg.ramo)}`);
    if (conteudo.naoExiste) continue;
    const texto = conteudo.encoding === 'base64' ? deBase64(conteudo.content) : (conteudo.content || '');
    const eventos = desserializar(texto);
    importados += await log.importar(eventos, { jaSincronizados: true });
    shas[arq.path] = arq.sha;
  }
  await db.setMeta('sync.shas', shas);
  return importados;
}

// ---------------- empurrar ----------------

/**
 * Um evento vindo de backup pode ter nascido em outro aparelho. Ele nao pode ir
 * para a pasta desse aparelho (sobrescreveria o que ele tem la'), entao vai
 * para uma pasta de importacao deste aparelho. Como a juncao e' por id de
 * evento, duplicata some sozinha.
 */
function baldeDe(ev, meu) {
  return ev.deviceId === meu ? meu : meu + '~importados';
}

async function gravarArquivo(caminho, texto, mensagem) {
  const corpo = {
    message: mensagem,
    content: paraBase64(texto),
    branch: cfg.ramo,
  };
  if (shas[caminho]) corpo.sha = shas[caminho];
  const url = `/repos/${cfg.repo}/contents/${caminho.split('/').map(encodeURIComponent).join('/')}`;

  try {
    const r = await api(url, { method: 'PUT', body: JSON.stringify(corpo) });
    if (r && r.content) shas[caminho] = r.content.sha;
    return true;
  } catch (err) {
    if (err.status !== 409 && err.status !== 422) throw err;
    // Ou alguem gravou no meio do caminho, ou o sha que eu guardei ficou velho.
    // Busca o sha atual e tenta uma vez mais. Se o arquivo nao existe (caso do
    // repositorio ainda vazio), grava sem sha, o que cria o arquivo do zero.
    let atual = { naoExiste: true };
    try { atual = await api(`${url}?ref=${encodeURIComponent(cfg.ramo)}`); }
    catch (e2) { if (e2.status !== 409 && e2.status !== 404) throw e2; }
    if (!atual.naoExiste && atual.sha) corpo.sha = atual.sha;
    else delete corpo.sha;
    const r2 = await api(url, { method: 'PUT', body: JSON.stringify(corpo) });
    if (r2 && r2.content) shas[caminho] = r2.content.sha;
    return true;
  }
}

async function empurrar() {
  const pendentes = await db.eventosPendentes();
  if (!pendentes.length) return 0;

  const meu = deviceId();
  const todos = log.eventos();
  const grupos = new Map();
  for (const ev of pendentes) {
    const chave = baldeDe(ev, meu) + '/' + mesDoEvento(ev);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(ev);
  }

  let enviados = 0;
  for (const [chave] of grupos) {
    const [balde, mes] = [chave.slice(0, chave.lastIndexOf('/')), chave.slice(chave.lastIndexOf('/') + 1)];
    // Reescreve o arquivo inteiro do mes: e' o conteudo completo que este
    // aparelho conhece para aquele balde, entao o arquivo nunca fica pela metade.
    const doMes = todos.filter((ev) => baldeDe(ev, meu) === balde && mesDoEvento(ev) === mes);
    const caminho = `eventos/${balde}/${mes}.jsonl`;
    await gravarArquivo(caminho, serializar(doMes), `AME Store — ${balde} ${mes} (${doMes.length} eventos)`);
    enviados += grupos.get(chave).length;
  }

  await db.marcarSincronizados(pendentes.map((e) => e.id));
  await db.setMeta('sync.shas', shas);
  return enviados;
}

// ---------------- orquestracao ----------------

export async function sincronizar({ manual = false } = {}) {
  if (!cfg.repo || !cfg.token) return { desligada: true, enviados: 0, recebidos: 0 };
  if (emAndamento) return emAndamento;
  if (!navigator.onLine && !manual) return { offline: true, enviados: 0, recebidos: 0 };

  emAndamento = (async () => {
    try {
      const recebidos = await puxar();
      const enviados = await empurrar();
      ultima = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      await db.setMeta('sync.ultima', ultima);
      return { enviados, recebidos };
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}

/** Tentativa de ultimo instante quando o app esta' sendo fechado. */
export function enviarPendentesRapido() {
  if (!cfg.repo || !cfg.token) return;
  db.eventosPendentes().then((p) => { if (p.length) sincronizar({}).catch(() => {}); });
}

/** Numero de eventos ainda nao enviados — mostrado em Ajustes. */
export async function pendentes() {
  return (await db.eventosPendentes()).length;
}
