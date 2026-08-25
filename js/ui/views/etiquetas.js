// etiquetas.js — folha de etiquetas com codigo de barras, para imprimir.
import * as log from '../../core/eventlog.js';
import { listarVariantes } from '../../domain/consultas.js';
import { brl, esc, normaliza } from '../../core/fmt.js';
import { svgEAN13 } from '../barras.js';
import { icone } from '../icones.js';
import { liga, debounce, vazio, toast , vista } from '../ui.js';

let selecao = {};   // varianteId -> quantidade de etiquetas
let termo = '';

export async function render(raiz) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const produtoFiltro = params.get('produto');
  const desenhar = vista(raiz, () => html(produtoFiltro), ligar);
  return log.assinar(desenhar);
}

function html(produtoFiltro) {
  const e = log.estado();
  let lista = listarVariantes(e);
  if (produtoFiltro) lista = lista.filter((v) => v.produtoId === produtoFiltro);
  const t = normaliza(termo);
  if (t) lista = lista.filter((v) => t.split(/\s+/).every((p) => v.busca.includes(p)));

  const total = Object.values(selecao).reduce((s, n) => s + n, 0);
  const etiquetas = [];
  for (const [id, qtd] of Object.entries(selecao)) {
    const v = e.variantes[id];
    if (!v) continue;
    const p = e.produtos[v.produtoId];
    for (let i = 0; i < qtd; i++) {
      etiquetas.push({
        nome: p ? p.nome : '', detalhe: [v.tamanho, v.cor].filter(Boolean).join(' · '),
        codigo: v.codigoBarras,
        preco: (v.precoVenda === null || v.precoVenda === undefined) ? (p ? p.precoVenda : 0) : v.precoVenda,
      });
    }
  }

  if (!lista.length && !total) {
    return vazio('etiqueta', 'Nada para etiquetar', 'Cadastre produtos no estoque primeiro.');
  }

  return `
  <div class="cartao nao-imprimir">
    <div class="busca mb">${icone('busca')}
      <input id="et-busca" placeholder="Buscar peça" value="${esc(termo)}"></div>
    <div class="barra-botoes mb">
      <button class="btn btn-p" data-acao="todas-1">1 etiqueta por item</button>
      <button class="btn btn-p" data-acao="por-saldo">Uma por peça em estoque</button>
      <button class="btn btn-p" data-acao="limpar">Limpar</button>
    </div>
    <div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir">Saldo</th><th class="dir" style="width:110px">Etiquetas</th></tr></thead>
      <tbody>${lista.map((v) => `<tr>
        <td>${esc(v.rotulo)}<br><span class="texto-3 mono pequeno">${esc(v.codigoBarras)}</span></td>
        <td class="dir num">${v.saldo}</td>
        <td class="dir"><input type="number" min="0" step="1" value="${selecao[v.id] || 0}"
          data-qtd="${v.id}" style="text-align:right"></td></tr>`).join('')}
      </tbody></table></div>
  </div>

  <div class="cartao nao-imprimir flex entre centro">
    <span class="texto-2">${total} etiqueta(s) na folha</span>
    <button class="btn btn-primario" data-acao="imprimir" ${total ? '' : 'disabled'}>
      ${icone('imprimir', 16)} Imprimir</button>
  </div>

  ${total ? `<div class="cartao">
    <div class="folha-etiquetas">${etiquetas.map((et) => `
      <div class="etiqueta-print">
        <div class="nome-e">${esc(et.nome)}</div>
        <div>${esc(et.detalhe)}</div>
        ${svgEAN13(et.codigo, { altura: 34, larguraModulo: 1.3 })}
        <div class="preco-e">${brl(et.preco)}</div>
      </div>`).join('')}</div>
  </div>` : ''}`;
}

function ligar(raiz, redesenhar) {
  const e = log.estado();
  const busca = raiz.querySelector('#et-busca');
  if (busca) busca.addEventListener('input', debounce((ev) => {
    termo = ev.target.value; redesenhar();
    const b = document.getElementById('et-busca');
    if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  }, 220));

  liga(raiz, 'change', '[data-qtd]', (ev, el) => {
    const n = Math.max(0, parseInt(el.value, 10) || 0);
    if (n) selecao[el.dataset.qtd] = n; else delete selecao[el.dataset.qtd];
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="todas-1"]', () => {
    for (const v of listarVariantes(e)) selecao[v.id] = 1;
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="por-saldo"]', () => {
    selecao = {};
    for (const v of listarVariantes(e)) if (v.saldo > 0) selecao[v.id] = v.saldo;
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="limpar"]', () => { selecao = {}; redesenhar(); });
  liga(raiz, 'click', '[data-acao="imprimir"]', () => {
    const total = Object.values(selecao).reduce((s, n) => s + n, 0);
    if (!total) { toast('Escolha quantas etiquetas de cada peça.', 'erro'); return; }
    window.print();
  });
}
