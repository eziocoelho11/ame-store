// router.js — navegacao por hash (#/estoque).
// Hash e' de proposito: funciona no GitHub Pages sem nenhuma configuracao de
// servidor, e sobrevive a recarregar a pagina em qualquer tela.

import { icone } from './icones.js';

const rotas = [];
let limpezaAtual = null;
let rotaAtual = null;

/** registrar('/produto/:id', { titulo, carregar: () => import(...) }) */
export function registrar(padrao, def) {
  const partes = padrao.split('/').filter(Boolean);
  rotas.push({ padrao, partes, ...def });
}

function casar(caminho) {
  const partes = caminho.split('/').filter(Boolean);
  for (const r of rotas) {
    if (r.partes.length !== partes.length) continue;
    const params = {};
    let bate = true;
    for (let i = 0; i < r.partes.length; i++) {
      const p = r.partes[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(partes[i]);
      else if (p !== partes[i]) { bate = false; break; }
    }
    if (bate) return { rota: r, params };
  }
  return null;
}

export function caminhoAtual() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

export function irPara(caminho) {
  if (caminhoAtual() === caminho) { renderizar(); return; }
  location.hash = caminho;
}

export function voltar() {
  if (history.length > 1) history.back();
  else irPara('/');
}

export async function renderizar() {
  const caminho = caminhoAtual();
  const achado = casar(caminho) || casar('/');
  if (!achado) return;

  if (limpezaAtual) { try { limpezaAtual(); } catch (e) { console.warn(e); } limpezaAtual = null; }

  const { rota, params } = achado;
  rotaAtual = rota;
  const raiz = document.getElementById('conteudo');
  raiz.innerHTML = '<div class="vazio">carregando…</div>';

  try {
    const mod = await rota.carregar();
    document.title = (rota.titulo ? rota.titulo + ' · ' : '') + 'AME Store';
    definirTopo(rota, params);
    raiz.innerHTML = '';
    const limpeza = await mod.render(raiz, params);
    if (typeof limpeza === 'function') limpezaAtual = limpeza;
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    raiz.innerHTML = `<div class="aviso aviso-erro">${icone('alerta')}
      <div><strong>Não consegui abrir esta tela.</strong>${err.message || err}</div></div>`;
  }
  marcarNavAtiva(caminho);
}

function definirTopo(rota, params) {
  const topo = document.getElementById('topo-titulo');
  if (topo) topo.textContent = rota.titulo || 'AME Store';
  const btnVoltar = document.getElementById('btn-voltar');
  if (btnVoltar) btnVoltar.classList.toggle('oculto', !rota.temVoltar);
  void params;
}

function marcarNavAtiva(caminho) {
  const base = '/' + (caminho.split('/').filter(Boolean)[0] || '');
  for (const a of document.querySelectorAll('[data-nav]')) {
    const alvo = a.getAttribute('href').replace(/^#/, '');
    const alvoBase = '/' + (alvo.split('/').filter(Boolean)[0] || '');
    a.classList.toggle('ativo', alvoBase === base);
  }
}

export function iniciarRoteador() {
  window.addEventListener('hashchange', renderizar);
  renderizar();
}

export function rota() { return rotaAtual; }
