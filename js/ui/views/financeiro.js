// financeiro.js — regime de CAIXA. Quando o dinheiro entra e quando sai.
// A DRE diz se a loja da' lucro; esta tela diz se tem dinheiro na conta.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { recebiveis, aReceber, aReceberPorMes, fluxoCaixa, rotuloRecebivel } from '../../domain/consultas.js';
import { brl, esc, iso, dataBR, dataCurta, competencia, limitesDaCompetencia, competenciaBR, somaDias } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, tag, vazio, paraCSV, csvMoeda, baixarArquivo, confirmar , vista } from '../ui.js';
import { barras as grafBarras } from '../graficos.js';
import { irPara } from '../router.js';

let aba = 'receber';
let periodo = null;
let selecionados = new Set();

export async function render(raiz) {
  if (!periodo) {
    const { inicio, fim } = limitesDaCompetencia(competencia(iso()));
    periodo = { de: inicio, ate: fim };
  }
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function html() {
  const e = log.estado();
  const hoje = iso();
  const r = aReceber(e, hoje);
  const fluxo = fluxoCaixa(e, periodo.de, periodo.ate);
  const recebidoNoPeriodo = Object.values(e.recebiveis)
    .filter((x) => x.status === 'recebido' && x.recebidoEm >= periodo.de && x.recebidoEm <= periodo.ate)
    .reduce((s, x) => s + x.liquido, 0);

  return `
  <div class="grade grade-4 mb">
    ${kpi('A receber', brl(r.total), `cartão ${brl(r.cartao)} · fiado ${brl(r.fiado)}`, 'destaque')}
    ${kpi('Vencido', brl(r.vencidos), r.nVencidos ? r.nVencidos + ' parcela(s)' : 'nada vencido')}
    ${kpi('Próximos 30 dias', brl(r.proximos30))}
    ${kpi('Saldo do período', brl(fluxo.saldo), `entrou ${brl(fluxo.entradas)} · saiu ${brl(fluxo.saidas)}`)}
  </div>

  <div class="pilulas mb">
    <button class="pilula ${aba === 'receber' ? 'ativa' : ''}" data-aba="receber">A receber</button>
    <button class="pilula ${aba === 'recebido' ? 'ativa' : ''}" data-aba="recebido">Recebidos</button>
    <button class="pilula ${aba === 'fluxo' ? 'ativa' : ''}" data-aba="fluxo">Fluxo de caixa</button>
  </div>

  ${aba === 'fluxo' ? fluxoHTML(fluxo) : listaHTML(e, aba === 'recebido', hoje, recebidoNoPeriodo)}`;
}

function listaHTML(e, recebidos, hoje, totalRecebido) {
  const lista = recebidos
    ? recebiveis(e, { status: 'recebido' })
      .filter((r) => r.recebidoEm >= periodo.de && r.recebidoEm <= periodo.ate)
      .sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm))
    : recebiveis(e, { status: 'aberto' });

  const selecionadoTotal = [...selecionados]
    .map((id) => e.recebiveis[id]).filter(Boolean)
    .reduce((s, r) => s + r.liquido, 0);

  return `
  ${recebidos ? `<div class="filtros">
    <div class="campo-grupo"><label>De</label><input type="date" data-de value="${periodo.de}"></div>
    <div class="campo-grupo"><label>Até</label><input type="date" data-ate value="${periodo.ate}"></div>
    <div class="crescer"></div>
    <div class="kpi" style="min-width:170px"><div class="rotulo-kpi">Recebido no período</div>
      <div class="valor-kpi">${brl(totalRecebido)}</div></div>
  </div>` : ''}

  ${!recebidos && selecionados.size ? `<div class="aviso aviso-info">${icone('info')}
    <div><strong>${selecionados.size} parcela(s) selecionada(s) — ${brl(selecionadoTotal)}.</strong>
    <button class="btn btn-p btn-primario" data-acao="baixar-lote">Marcar como recebidas</button>
    <button class="btn btn-p" data-acao="limpar-selecao">Limpar</button></div></div>` : ''}

  ${!recebidos ? previsaoHTML(e, hoje) : ''}

  ${lista.length ? `<div class="cartao"><div class="rolagem-x"><table>
    <thead><tr>
      ${recebidos ? '' : '<th style="width:34px"></th>'}
      <th>Origem</th><th>${recebidos ? 'Recebido em' : 'Vencimento'}</th>
      <th class="dir">Bruto</th><th class="dir">Taxa</th><th class="dir">Líquido</th><th></th>
    </tr></thead>
    <tbody>${lista.map((r) => {
      const cliente = r.clienteId && e.clientes[r.clienteId] ? e.clientes[r.clienteId].nome : '';
      const vencido = !recebidos && r.vencimento < hoje;
      return `<tr>
        ${recebidos ? '' : `<td><input type="checkbox" data-sel="${esc(r.id)}"${selecionados.has(r.id) ? ' checked' : ''}></td>`}
        <td>${r.vendaId
          ? `<a href="#/venda/${esc(r.vendaId)}">${esc(rotuloRecebivel(r))}</a>`
          : esc(rotuloRecebivel(r))}
          ${cliente ? `<br><span class="texto-3 pequeno">${esc(cliente)}</span>` : ''}</td>
        <td>${dataBR(recebidos ? r.recebidoEm : r.vencimento)} ${vencido ? tag('vencido', 'erro') : ''}</td>
        <td class="dir num">${brl(r.bruto)}</td>
        <td class="dir num">${r.taxa ? '− ' + brl(r.taxa) : '—'}</td>
        <td class="dir num negrito">${brl(r.liquido)}</td>
        <td class="dir">${recebidos
          ? `<button class="btn btn-p btn-fantasma" data-estornar="${esc(r.id)}">Estornar</button>`
          : `<button class="btn btn-p" data-baixar="${esc(r.id)}">Baixar</button>`}</td>
      </tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="${recebidos ? 4 : 5}">Total</td>
      <td class="dir num">${brl(lista.reduce((s, r) => s + r.liquido, 0))}</td><td></td></tr></tfoot>
  </table></div></div>`
    : vazio('dinheiro', recebidos ? 'Nada recebido no período' : 'Nada a receber',
      recebidos ? 'Ajuste as datas acima.' : 'Toda venda no dinheiro ou PIX já entra como recebida.')}`;
}

/**
 * Previsao de entrada por mes. Uma venda no fiado em 4x vira dinheiro em quatro
 * meses diferentes: sem esta tabela, isso so' aparece quando o mes chega.
 */
function previsaoHTML(e, hoje) {
  const meses = aReceberPorMes(e, { hoje, meses: 6 });
  if (!meses.length) return '';
  return `<div class="cartao">
    <h3>Previsão de entrada por mês</h3>
    <div class="rolagem-x"><table>
      <thead><tr><th>Mês</th><th class="dir">Cartão</th><th class="dir">Fiado</th>
        <th class="dir">Parcelas</th><th class="dir">Total</th></tr></thead>
      <tbody>${meses.map((m) => `<tr>
        <td>${esc(competenciaBR(m.comp))}
          ${m.vencido ? tag('vencido ' + brl(m.vencido), 'erro') : ''}</td>
        <td class="dir num">${m.cartao ? brl(m.cartao) : '—'}</td>
        <td class="dir num">${m.fiado ? brl(m.fiado) : '—'}</td>
        <td class="dir num texto-3">${m.n}</td>
        <td class="dir num negrito">${brl(m.total)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="dica">Valores líquidos, já sem a taxa da maquininha. Parcela vencida aparece no mês atual — é dinheiro que já deveria ter entrado. Isto é previsão: só vira caixa quando a parcela for baixada.</p>
  </div>`;
}

function fluxoHTML(fluxo) {
  return `
  <div class="filtros">
    <div class="campo-grupo"><label>De</label><input type="date" data-de value="${periodo.de}"></div>
    <div class="campo-grupo"><label>Até</label><input type="date" data-ate value="${periodo.ate}"></div>
    <div class="crescer"></div>
    <button class="btn" data-acao="csv-fluxo">${icone('documento', 16)} CSV</button>
  </div>

  ${fluxo.dias.length ? `
  <div class="cartao">
    <h3>Saldo por dia</h3>
    ${grafBarras(fluxo.dias.map((d) => ({ rotulo: dataCurta(d.data), valor: d.saldo })),
      { formato: (v) => brl(v).replace('R$ ', '') })}
    <div class="legenda"><span>Barra para baixo = dia em que saiu mais dinheiro do que entrou.</span></div>
  </div>

  <div class="cartao">
    <div class="rolagem-x"><table>
      <thead><tr><th>Dia</th><th class="dir">Entradas</th><th class="dir">Saídas</th>
        <th class="dir">Saldo</th><th class="dir">Acumulado</th></tr></thead>
      <tbody>${fluxo.dias.map((d) => `<tr>
        <td>${dataBR(d.data)}</td>
        <td class="dir num positivo">${d.entradas ? brl(d.entradas) : '—'}</td>
        <td class="dir num negativo">${d.saidas ? brl(d.saidas) : '—'}</td>
        <td class="dir num ${d.saldo < 0 ? 'negativo' : ''}">${brl(d.saldo)}</td>
        <td class="dir num negrito ${d.acumulado < 0 ? 'negativo' : ''}">${brl(d.acumulado)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td>
        <td class="dir num">${brl(fluxo.entradas)}</td>
        <td class="dir num">${brl(fluxo.saidas)}</td>
        <td class="dir num">${brl(fluxo.saldo)}</td><td></td></tr></tfoot>
    </table></div>
    <p class="dica">Compra de mercadoria entra aqui como saída no dia da entrada no estoque — na DRE ela só aparece como CMV quando a peça é vendida. É a mesma compra vista de dois jeitos, e os dois estão certos.</p>
  </div>`
    : vazio('dinheiro', 'Sem movimento no período', 'Ajuste as datas acima.')}`;
}

function ligar(raiz, redesenhar) {
  const e = log.estado();

  liga(raiz, 'click', '[data-aba]', (ev, el) => { aba = el.dataset.aba; selecionados.clear(); redesenhar(); });
  liga(raiz, 'change', '[data-de]', (ev, el) => { periodo.de = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-ate]', (ev, el) => { periodo.ate = el.value; redesenhar(); });

  liga(raiz, 'change', '[data-sel]', (ev, el) => {
    if (el.checked) selecionados.add(el.dataset.sel); else selecionados.delete(el.dataset.sel);
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="limpar-selecao"]', () => { selecionados.clear(); redesenhar(); });

  liga(raiz, 'click', '[data-acao="baixar-lote"]', async () => {
    const ids = [...selecionados];
    if (!ids.length) return;
    const total = ids.map((id) => e.recebiveis[id]).filter(Boolean).reduce((s, r) => s + r.liquido, 0);
    const ok = await confirmar('Marcar como recebidas',
      `${ids.length} parcela(s), ${brl(total)} líquidos, entram no caixa de hoje (${dataBR(iso())}).`,
      { textoOk: 'Marcar' });
    if (!ok) return;
    await acoes.baixarVarios(ids, '', iso());
    selecionados.clear();
    toast(`${ids.length} recebimento(s) baixado(s).`, 'ok');
  });

  liga(raiz, 'click', '[data-baixar]', async (ev, el) => {
    await acoes.baixarRecebivel(el.dataset.baixar, '', iso());
    toast('Recebimento baixado.', 'ok');
  });
  liga(raiz, 'click', '[data-estornar]', async (ev, el) => {
    await acoes.estornarRecebivel(el.dataset.estornar);
    toast('Recebimento estornado.');
  });

  liga(raiz, 'click', '[data-acao="csv-fluxo"]', () => {
    const fluxo = fluxoCaixa(e, periodo.de, periodo.ate);
    const linhas = [];
    for (const d of fluxo.dias) {
      for (const i of d.itens) {
        linhas.push([dataBR(d.data), i.tipo === 'entrada' ? 'Entrada' : 'Saída', i.desc, csvMoeda(i.valor)]);
      }
    }
    const csv = paraCSV(['Data', 'Tipo', 'Descrição', 'Valor'], linhas);
    baixarArquivo(`AME Store - fluxo de caixa ${periodo.de} a ${periodo.ate}.csv`, csv, 'text/csv');
    toast('Arquivo gerado.', 'ok');
  });

  void irPara; void somaDias;
}
