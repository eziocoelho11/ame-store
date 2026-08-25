// vendas.js — historico de vendas com filtro por periodo e canal.
import * as log from '../../core/eventlog.js';
import { vendasNoPeriodo, resumoVendas } from '../../domain/consultas.js';
import { brl, esc, iso, dataBR, pct, num, competencia, limitesDaCompetencia, competenciaBR } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, vazio, tag, toast, paraCSV, csvMoeda, baixarArquivo , vista } from '../ui.js';
import { irPara } from '../router.js';

let periodo = null;
let canal = '';

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
    <button class="btn" data-acao="csv">${icone('documento', 16)} CSV</button>
  </div>

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
    const cliente = v.clienteId && e.clientes[v.clienteId] ? e.clientes[v.clienteId].nome : '';
    const formas = [...new Set(v.pagamentos.map((p) => p.forma))].join(', ');
    return `<div class="item" data-venda="${v.id}">
      <div class="avatar">#${v.numero}</div>
      <div class="corpo">
        <div class="titulo">${esc(cliente || v.canalNome)} ${status}</div>
        <div class="sub">${dataBR(v.data)}${v.hora ? ' ' + v.hora : ''} · ${v.itens.reduce((s, i) => s + i.qtd, 0)} peças · ${esc(formas)}</div>
      </div>
      <div class="valor"${v.status === 'cancelada' ? ' style="text-decoration:line-through;opacity:.5"' : ''}>
        ${brl(v.totais.liquido)}${v.totais.devolvido ? `<small class="negativo">− ${brl(v.totais.devolvido)}</small>` : ''}</div>
    </div>`;
  }).join('')}</div></div>`
    : vazio('recibo', 'Nenhuma venda no período',
      'Ajuste as datas acima ou registre uma venda.',
      '<a class="btn btn-primario" href="#/vender">Ir para o PDV</a>')}`;
}

function ligar(raiz, redesenhar) {
  liga(raiz, 'change', '[data-de]', (ev, el) => { periodo.de = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-ate]', (ev, el) => { periodo.ate = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-canal]', (ev, el) => { canal = el.value; redesenhar(); });
  liga(raiz, 'click', '[data-venda]', (ev, el) => irPara('/venda/' + el.dataset.venda));
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
  void competenciaBR;
}
