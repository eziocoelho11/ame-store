// vendas.js — historico de vendas com filtro por periodo e canal.
import * as log from '../../core/eventlog.js';
import { vendasNoPeriodo, resumoVendas } from '../../domain/consultas.js';
import { brl, esc, iso, dataBR, pct, num, competencia, limitesDaCompetencia, competenciaBR } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, vazio, tag, toast, confirmar, paraCSV, csvMoeda, baixarArquivo , vista } from '../ui.js';
import { irPara } from '../router.js';
import * as acoes from '../../domain/acoes.js';

let periodo = null;
let canal = '';
// Selecao multipla para trocar o canal em lote. Mora fora do html() porque a
// tela e' redesenhada a cada evento do log, e redesenhar nao pode perder o que
// ja' estava marcado.
let selecionados = new Set();

function periodoPadrao() {
  const { inicio, fim } = limitesDaCompetencia(competencia(iso()));
  return { de: inicio, ate: fim };
}

export async function render(raiz) {
  if (!periodo) periodo = periodoPadrao();
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function html() {
  const e = log.estado();
  const lista = vendasNoPeriodo(e, periodo.de, periodo.ate, { canal, incluirCanceladas: true });
  const ativas = lista.filter((v) => v.status !== 'cancelada');
  const r = resumoVendas(ativas);
  const canais = e.config.canais || [];

  return `
  <div class="filtros">
    <div class="campo-grupo"><label>De</label><input type="date" data-de value="${periodo.de}"></div>
    <div class="campo-grupo"><label>Até</label><input type="date" data-ate value="${periodo.ate}"></div>
    <div class="campo-grupo"><label>Canal</label>
      <select data-canal><option value="">Todos</option>
        ${canais.map((c) => `<option value="${esc(c.id)}"${canal === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
      </select></div>
    <div class="crescer"></div>
    ${ativas.length ? `<button class="btn" data-acao="marcar-todas">Selecionar as ${ativas.length}</button>` : ''}
    <button class="btn" data-acao="csv">${icone('documento', 16)} CSV</button>
  </div>

  <div id="vendas-selecao"></div>

  <div class="grade grade-4 mb">
    ${kpi('Receita', brl(r.receita), `${r.n} ${r.n === 1 ? 'venda' : 'vendas'}`)}
    ${kpi('Ticket médio', brl(r.ticket), num(r.itens) + ' peças')}
    ${kpi('Margem bruta', brl(r.lucroBruto), 'após CMV e taxas · ' + pct(r.margem))}
    ${kpi('Descontos', brl(r.desconto))}
  </div>

  ${lista.length ? `<div class="cartao"><div class="lista">${lista.map((v) => {
    const status = v.status === 'cancelada' ? tag('cancelada', 'erro')
      : v.status === 'devolvida' ? tag('devolvida', 'erro')
      : v.status === 'parcial' ? tag('devolução parcial', 'alerta') : '';
    const dif = v.totais.trocaDiferenca || 0;
    const etiquetaTroca = (v.trocas || []).length ? tag('troca', 'info') : '';
    const cliente = v.clienteId && e.clientes[v.clienteId] ? e.clientes[v.clienteId].nome : '';
    const formas = [...new Set(v.pagamentos.map((p) => p.forma))].join(', ');
    return `<div class="item" data-venda="${v.id}">
      ${v.status === 'cancelada' ? '<span style="min-width:40px"></span>'
        : `<label class="caixa-toque" title="Selecionar para trocar o canal">
          <input type="checkbox" data-sel="${esc(v.id)}"${selecionados.has(v.id) ? ' checked' : ''}></label>`}
      <div class="avatar">#${v.numero}</div>
      <div class="corpo">
        <div class="titulo">${esc(cliente || v.canalNome)} ${status} ${etiquetaTroca}</div>
        <div class="sub">${dataBR(v.data)}${v.hora ? ' ' + v.hora : ''} · ${v.itens.reduce((s, i) => s + i.qtd, 0)} peças · ${esc(formas)}
          · ${esc(v.canalNome)}${v.canalAnterior ? ' <i class="tag tag-info">canal trocado</i>' : ''}</div>
      </div>
      <div class="valor"${v.status === 'cancelada' ? ' style="text-decoration:line-through;opacity:.5"' : ''}>
        ${brl(v.totais.liquido + dif)}${v.totais.devolvido ? `<small class="negativo">− ${brl(v.totais.devolvido)}</small>` : ''}
        ${dif ? `<small class="${dif < 0 ? 'negativo' : ''}">troca ${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))}</small>` : ''}</div>
    </div>`;
  }).join('')}</div></div>`
    : vazio('recibo', 'Nenhuma venda no período',
      'Ajuste as datas acima ou registre uma venda.',
      '<a class="btn btn-primario" href="#/vender">Ir para o PDV</a>')}`;
}

/**
 * Desenha SO' a barra de selecao. E' o unico pedaco que muda quando o usuario
 * marca uma venda: redesenhar a tela inteira a cada clique perderia a rolagem
 * e faria o segundo toque cair na linha errada.
 */
function barraSelecao(raiz) {
  const alvo = raiz.querySelector('#vendas-selecao');
  if (!alvo) return;
  if (!selecionados.size) { alvo.innerHTML = ''; return; }

  const e = log.estado();
  const canais = e.config.canais || [];
  const marcadas = [...selecionados].map((id) => e.vendas[id]).filter(Boolean);
  const total = marcadas.reduce((soma, v) => soma + v.totais.liquido, 0);

  alvo.innerHTML = `<div class="barra-selecao">
    <div class="crescer"><strong>${marcadas.length} venda(s)</strong>
      <div class="texto-2 pequeno">${brl(total)}</div></div>
    <select data-canal-novo aria-label="Canal novo">
      <option value="">Trocar o canal para…</option>
      ${canais.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}
    </select>
    <button class="btn btn-p" data-acao="limpar-selecao">Limpar</button>
  </div>`;
}

function ligar(raiz, redesenhar) {
  liga(raiz, 'change', '[data-de]', (ev, el) => { periodo.de = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-ate]', (ev, el) => { periodo.ate = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-canal]', (ev, el) => { canal = el.value; redesenhar(); });
  liga(raiz, 'click', '[data-venda]', (ev, el) => {
    // O clique na caixinha e' para marcar, nao para abrir a venda.
    if (ev.target.closest('.caixa-toque')) return;
    irPara('/venda/' + el.dataset.venda);
  });

  liga(raiz, 'change', '[data-sel]', (ev, el) => {
    if (el.checked) selecionados.add(el.dataset.sel); else selecionados.delete(el.dataset.sel);
    barraSelecao(raiz);
  });

  liga(raiz, 'click', '[data-acao="marcar-todas"]', () => {
    const e = log.estado();
    const lista = vendasNoPeriodo(e, periodo.de, periodo.ate, { canal });
    for (const v of lista) selecionados.add(v.id);
    redesenhar();
  });

  liga(raiz, 'click', '[data-acao="limpar-selecao"]', () => {
    selecionados.clear();
    redesenhar();
  });

  liga(raiz, 'change', '[data-canal-novo]', async (ev, el) => {
    const canalId = el.value;
    if (!canalId) return;
    const e = log.estado();
    const nome = (e.config.canais || []).find((c) => c.id === canalId);
    const quantas = selecionados.size;
    const ok = await confirmar(`Trocar o canal de ${quantas} venda(s)?`,
      `Elas passam de onde estão para <strong>${esc(nome ? nome.nome : canalId)}</strong>.
       Nenhum valor muda: isso só altera onde essas vendas contam nos relatórios,
       e dá para trocar de novo depois.`,
      { textoOk: 'Trocar canal' });
    el.value = '';
    if (!ok) return;
    try {
      const mudaram = await acoes.alterarCanalVenda([...selecionados], canalId);
      selecionados.clear();
      redesenhar();
      toast(mudaram === quantas
        ? `${mudaram} venda(s) no canal "${nome ? nome.nome : canalId}".`
        : `${mudaram} de ${quantas} mudaram — as outras já estavam nesse canal.`, 'ok');
    } catch (erro) {
      toast('Não deu para trocar o canal: ' + erro.message, 'erro');
    }
  });
  liga(raiz, 'click', '[data-acao="csv"]', () => {
    const e = log.estado();
    const lista = vendasNoPeriodo(e, periodo.de, periodo.ate, { canal, incluirCanceladas: true });
    const linhas = [];
    for (const v of lista) {
      for (const it of v.itens) {
        const variante = e.variantes[it.varianteId] || {};
        const produto = e.produtos[variante.produtoId] || {};
        linhas.push([
          v.numero, dataBR(v.data), v.hora || '', v.canalNome,
          v.clienteId && e.clientes[v.clienteId] ? e.clientes[v.clienteId].nome : '',
          produto.nome || '', variante.tamanho || '', variante.cor || '', variante.sku || '',
          it.qtd, csvMoeda(it.precoUnit), csvMoeda(it.descontoUnit), csvMoeda(it.custoUnit),
          csvMoeda(it.bruto - it.desconto), v.status,
        ]);
      }
    }
    const csv = paraCSV(['Venda', 'Data', 'Hora', 'Canal', 'Cliente', 'Produto', 'Tamanho', 'Cor', 'SKU',
      'Qtd', 'Preço un.', 'Desconto un.', 'Custo un.', 'Total item', 'Situação'], linhas);
    baixarArquivo(`AME Store - vendas ${periodo.de} a ${periodo.ate}.csv`, csv, 'text/csv');
    toast('Arquivo gerado.', 'ok');
  });
  // Por ultimo: o `vista` chama este `ligar` depois de CADA redesenho, entao e'
  // aqui que a barra renasce. Chamar depois de `redesenhar()` nao funciona — o
  // redesenho e' async e troca o no' logo em seguida, apagando a barra.
  barraSelecao(raiz);
  void competenciaBR;
}
