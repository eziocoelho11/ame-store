// financeiro.js — regime de CAIXA. Quando o dinheiro entra e quando sai.
// A DRE diz se a loja da' lucro; esta tela diz se tem dinheiro na conta.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { recebiveis, aReceber, aReceberPorMes, fluxoCaixa, rotuloRecebivel, saldoDe } from '../../domain/consultas.js';
import { brl, esc, iso, dataBR, dataCurta, competencia, limitesDaCompetencia, competenciaBR, normaliza } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, tag, vazio, paraCSV, csvMoeda, baixarArquivo, confirmar, debounce, vista } from '../ui.js';
import { barras as grafBarras } from '../graficos.js';
import { abrirRecebimento } from '../receber.js';
import { abrirEdicaoParcela } from '../editar-parcela.js';
import { extratoCliente, imprimirFolha } from '../impressao.js';

let aba = 'receber';
let periodo = null;
let selecionados = new Set();

// Os filtros vivem no modulo, e nao dentro do HTML: a tela se redesenha inteira
// a cada evento gravado, entao guardar o filtro no elemento o perderia toda vez
// que uma parcela fosse baixada.
let fReceber = { termo: '', situacao: '', tipo: '' };
let fDevedores = { termo: '', situacao: '', ordem: 'vencido' };

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
  // Soma PAGAMENTO por pagamento: parcela paga em duas vezes conta metade em
  // cada janela, e nao tudo no dia em que fechou.
  const recebidoNoPeriodo = Object.values(e.recebiveis)
    .flatMap((x) => x.pagamentos || [])
    .filter((pg) => pg.data >= periodo.de && pg.data <= periodo.ate)
    .reduce((s, pg) => s + pg.valor, 0);

  return `
  <div class="grade grade-4 mb">
    ${kpi('A receber', brl(r.total), `cartão ${brl(r.cartao)} · fiado ${brl(r.fiado)}`, 'destaque')}
    ${kpi('Vencido', brl(r.vencidos), r.nVencidos ? r.nVencidos + ' parcela(s)' : 'nada vencido')}
    ${kpi('Próximos 30 dias', brl(r.proximos30))}
    ${kpi('Saldo do período', brl(fluxo.saldo), `entrou ${brl(fluxo.entradas)} · saiu ${brl(fluxo.saidas)}`)}
  </div>

  <div class="pilulas mb">
    <button class="pilula ${aba === 'receber' ? 'ativa' : ''}" data-aba="receber">A receber</button>
    <button class="pilula ${aba === 'devedores' ? 'ativa' : ''}" data-aba="devedores">Devedores</button>
    <button class="pilula ${aba === 'recebido' ? 'ativa' : ''}" data-aba="recebido">Recebidos</button>
    <button class="pilula ${aba === 'fluxo' ? 'ativa' : ''}" data-aba="fluxo">Fluxo de caixa</button>
  </div>

  ${aba === 'fluxo' ? fluxoHTML(fluxo)
    : aba === 'devedores' ? devedoresHTML(e, hoje)
    : aba === 'recebido' ? recebidosHTML(e, recebidoNoPeriodo)
    : aReceberHTML(e, hoje)}`;
}

// =====================================================================
// Filtros — a mesma ideia nas duas abas: achar pelo nome e separar o que
// esta' vencido do que ainda vai vencer.
// =====================================================================

/** Casa o que foi digitado com cliente, origem, descricao e numero da venda. */
function casaTermo(e, r, termo) {
  const t = normaliza(termo).trim();
  if (!t) return true;
  const cliente = r.clienteId && e.clientes[r.clienteId] ? e.clientes[r.clienteId].nome : '';
  const alvo = normaliza([cliente, rotuloRecebivel(r), r.descricao || '',
    r.numeroVenda ? '#' + r.numeroVenda : ''].join(' '));
  return t.split(/\s+/).every((p) => alvo.includes(p));
}

const TIPOS_CARTAO = ['credito', 'debito'];

function filtrarReceber(e, lista, hoje) {
  return lista.filter((r) => {
    const vencida = r.vencimento < hoje;
    if (fReceber.situacao === 'vencidas' && !vencida) return false;
    if (fReceber.situacao === 'avencer' && vencida) return false;
    if (fReceber.tipo === 'cartao' && !TIPOS_CARTAO.includes(r.tipo)) return false;
    if (fReceber.tipo === 'fiado' && r.tipo !== 'fiado') return false;
    if (fReceber.tipo === 'outros' && (TIPOS_CARTAO.includes(r.tipo) || r.tipo === 'fiado')) return false;
    return casaTermo(e, r, fReceber.termo);
  });
}

function opcao(valor, atual, texto) {
  return `<option value="${valor}"${atual === valor ? ' selected' : ''}>${texto}</option>`;
}

function filtrosReceberHTML(mostrando, total) {
  const filtrando = mostrando !== total;
  return `
  <div class="filtros">
    <div class="campo-grupo crescer busca" style="min-width:210px">${icone('busca')}
      <input id="fin-busca" placeholder="Buscar por cliente, origem ou nº da venda" value="${esc(fReceber.termo)}"></div>
    <div class="campo-grupo"><label>Situação</label>
      <select data-f="situacao">
        ${opcao('', fReceber.situacao, 'Todas')}
        ${opcao('vencidas', fReceber.situacao, 'Só vencidas')}
        ${opcao('avencer', fReceber.situacao, 'Só a vencer')}
      </select></div>
    <div class="campo-grupo"><label>Tipo</label>
      <select data-f="tipo">
        ${opcao('', fReceber.tipo, 'Todos')}
        ${opcao('cartao', fReceber.tipo, 'Cartão')}
        ${opcao('fiado', fReceber.tipo, 'Fiado')}
        ${opcao('outros', fReceber.tipo, 'Outros')}
      </select></div>
    ${filtrando ? '<button class="btn btn-p" data-acao="limpar-filtro-receber">Limpar filtro</button>' : ''}
  </div>
  ${filtrando ? `<p class="dica mb">Mostrando ${mostrando} de ${total} parcela(s) em aberto.</p>` : ''}`;
}

// =====================================================================
// A receber — agrupado por mes de vencimento
// =====================================================================

/**
 * Junta as parcelas em aberto por mes de vencimento.
 *
 * Parcela de mes passado NAO fica escondida la' atras: sobe para o mes corrente
 * marcada como vencida, ao lado do que vence agora. E' o mesmo criterio da
 * tabela de previsao, e vale pelo mesmo motivo — atrasado e' o primeiro a
 * cobrar, e uma lista que o deixa num cabecalho de marco nunca mais e' olhada.
 */
function gruposPorMes(lista, hoje) {
  const compAtual = hoje.slice(0, 7);
  const mapa = new Map();
  for (const r of lista) {
    const compVenc = r.vencimento.slice(0, 7);
    const comp = compVenc < compAtual ? compAtual : compVenc;
    if (!mapa.has(comp)) mapa.set(comp, { comp, itens: [], total: 0, nVencidas: 0, vencido: 0 });
    const g = mapa.get(comp);
    const falta = saldoDe(r);
    g.itens.push(r);
    g.total += falta;
    if (r.vencimento < hoje) { g.nVencidas++; g.vencido += falta; }
  }
  for (const g of mapa.values()) g.itens.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return [...mapa.values()].sort((a, b) => a.comp.localeCompare(b.comp));
}

function aReceberHTML(e, hoje) {
  const abertos = recebiveis(e, { status: 'aberto' });
  const lista = filtrarReceber(e, abertos, hoje);
  const grupos = gruposPorMes(lista, hoje);
  const compAtual = hoje.slice(0, 7);

  return `
  ${filtrosReceberHTML(lista.length, abertos.length)}

  <div id="fin-selecao"></div>

  ${previsaoHTML(e, hoje)}

  ${grupos.length ? grupos.map((g) => `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer">
        <h3>${esc(competenciaBR(g.comp))}${g.comp === compAtual ? ' ' + tag('mês atual', 'roxo') : ''}</h3>
        <div class="texto-2 pequeno">${g.itens.length} parcela(s)
          ${g.nVencidas ? '· ' + tag(g.nVencidas + ' vencida(s): ' + brl(g.vencido), 'erro') : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="valor-kpi">${brl(g.total)}</div>
        <div class="pequeno texto-3">a receber no mês</div>
      </div>
    </div>

    <div class="rolagem-x"><table>
      <thead><tr>
        <th style="width:34px"></th>
        <th>Origem</th><th>Vencimento</th>
        <th class="dir">Bruto</th><th class="dir">Taxa</th><th class="dir">Líquido</th><th></th>
      </tr></thead>
      <tbody>${g.itens.map((r) => linhaAReceber(e, r, hoje)).join('')}</tbody>
      <tfoot><tr><td colspan="5">Total do mês</td>
        <td class="dir num">${brl(g.total)}</td><td></td></tr></tfoot>
    </table></div>
  </div>`).join('')
    : vazio('dinheiro',
      abertos.length ? 'Nada com esse filtro' : 'Nada a receber',
      abertos.length ? 'Ajuste a busca ou a situação acima.'
        : 'Toda venda no dinheiro ou PIX já entra como recebida.')}`;
}

function linhaAReceber(e, r, hoje) {
  const cliente = r.clienteId && e.clientes[r.clienteId] ? e.clientes[r.clienteId].nome : '';
  const vencida = r.vencimento < hoje;
  return `<tr>
    <td><label class="caixa-toque"><input type="checkbox" data-sel="${esc(r.id)}"${selecionados.has(r.id) ? ' checked' : ''}></label></td>
    <td>${r.vendaId
      ? `<a href="#/venda/${esc(r.vendaId)}">${esc(rotuloRecebivel(r))}</a>`
      : esc(rotuloRecebivel(r))}
      ${cliente ? `<br><span class="texto-3 pequeno">${esc(cliente)}</span>` : ''}</td>
    <td>${dataBR(r.vencimento)} ${vencida ? tag('vencida', 'erro') : ''}
      ${r.status === 'parcial' ? tag('parcial', 'alerta') : ''}</td>
    <td class="dir num">${brl(r.bruto)}</td>
    <td class="dir num">${r.taxa ? '− ' + brl(r.taxa) : '—'}</td>
    <td class="dir num negrito">${brl(saldoDe(r))}
      ${r.status === 'parcial'
        ? `<br><span class="pequeno texto-3">de ${brl(r.liquido)} · pagos ${brl(r.pago)}</span>` : ''}</td>
    <td class="dir">${acoesParcelaHTML(r)}</td>
  </tr>`;
}

/** Editar vem antes de Receber: e' o botao que corrige, nao o que conclui. */
function acoesParcelaHTML(r) {
  return `<div class="acoes-celula">
    <button class="btn btn-p btn-icone btn-fantasma" data-editar="${esc(r.id)}"
      title="Editar data e valor" aria-label="Editar parcela">${icone('editar', 16)}</button>
    <button class="btn btn-p" data-receber="${esc(r.id)}">Receber</button>
  </div>`;
}

// =====================================================================
// Recebidos
// =====================================================================

function recebidosHTML(e, totalRecebido) {
  const lista = recebiveis(e, { status: 'recebido' })
    .filter((r) => r.recebidoEm >= periodo.de && r.recebidoEm <= periodo.ate)
    .sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm));

  return `
  <div class="filtros">
    <div class="campo-grupo"><label>De</label><input type="date" data-de value="${periodo.de}"></div>
    <div class="campo-grupo"><label>Até</label><input type="date" data-ate value="${periodo.ate}"></div>
    <div class="crescer"></div>
    <div class="kpi" style="min-width:170px"><div class="rotulo-kpi">Recebido no período</div>
      <div class="valor-kpi">${brl(totalRecebido)}</div></div>
  </div>

  ${lista.length ? `<div class="cartao"><div class="rolagem-x"><table>
    <thead><tr>
      <th>Origem</th><th>Recebido em</th>
      <th class="dir">Bruto</th><th class="dir">Taxa</th><th class="dir">Líquido</th><th></th>
    </tr></thead>
    <tbody>${lista.map((r) => {
      const cliente = r.clienteId && e.clientes[r.clienteId] ? e.clientes[r.clienteId].nome : '';
      return `<tr>
        <td>${r.vendaId
          ? `<a href="#/venda/${esc(r.vendaId)}">${esc(rotuloRecebivel(r))}</a>`
          : esc(rotuloRecebivel(r))}
          ${cliente ? `<br><span class="texto-3 pequeno">${esc(cliente)}</span>` : ''}</td>
        <td>${dataBR(r.recebidoEm)}</td>
        <td class="dir num">${brl(r.bruto)}</td>
        <td class="dir num">${r.taxa ? '− ' + brl(r.taxa) : '—'}</td>
        <td class="dir num negrito">${brl(r.liquido)}</td>
        <td class="dir"><button class="btn btn-p btn-fantasma" data-estornar="${esc(r.id)}">Estornar</button></td>
      </tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total</td>
      <td class="dir num">${brl(lista.reduce((s, r) => s + r.liquido, 0))}</td><td></td></tr></tfoot>
  </table></div></div>`
    : vazio('dinheiro', 'Nada recebido no período', 'Ajuste as datas acima.')}`;
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
    <p class="dica">Resumo de tudo que está em aberto, sem filtro. Valores líquidos, já sem a taxa da
      maquininha. Parcela vencida aparece no mês atual — é dinheiro que já deveria ter entrado. Isto é
      previsão: só vira caixa quando a parcela for baixada.</p>
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

/**
 * Devedores: quem deve, quanto, e ha' quanto tempo. A lista "A receber" mostra
 * parcela por parcela; aqui a pergunta e' outra — quem eu preciso cobrar. Por
 * isso agrupa por cliente e ordena pelo vencido, nao pela data.
 */
function devedoresHTML(e, hoje) {
  const abertos = recebiveis(e, { status: 'aberto' });
  const grupos = new Map();
  for (const r of abertos) {
    const chave = r.clienteId || '';
    if (!grupos.has(chave)) {
      const c = r.clienteId ? e.clientes[r.clienteId] : null;
      grupos.set(chave, {
        clienteId: r.clienteId || null,
        nome: c ? c.nome : 'Sem cliente identificado',
        telefone: c ? c.telefone : '',
        parcelas: [], total: 0, vencido: 0, nVencidas: 0, maisAntiga: '',
      });
    }
    const g = grupos.get(chave);
    const falta = saldoDe(r);
    g.parcelas.push(r);
    g.total += falta;
    if (r.vencimento < hoje) {
      g.vencido += falta;
      g.nVencidas++;
      if (!g.maisAntiga || r.vencimento < g.maisAntiga) g.maisAntiga = r.vencimento;
    }
  }
  const todos = [...grupos.values()];
  if (!todos.length) return vazio('pessoas', 'Ninguém devendo', 'Todo fiado e todo cartão já entraram.');

  const t = normaliza(fDevedores.termo).trim();
  const lista = todos
    .filter((g) => {
      if (fDevedores.situacao === 'vencidas' && !g.nVencidas) return false;
      if (fDevedores.situacao === 'emdia' && g.nVencidas) return false;
      if (!t) return true;
      const alvo = normaliza(g.nome + ' ' + (g.telefone || ''));
      return t.split(/\s+/).every((p) => alvo.includes(p));
    })
    .sort(ordemDevedores(fDevedores.ordem));

  const totalGeral = lista.reduce((s, g) => s + g.total, 0);
  const totalVencido = lista.reduce((s, g) => s + g.vencido, 0);
  const filtrando = lista.length !== todos.length;
  const zap = (tel) => 'https://wa.me/55' + String(tel).replace(/[^0-9]/g, '');

  return `
  <div class="filtros">
    <div class="campo-grupo crescer busca" style="min-width:210px">${icone('busca')}
      <input id="fin-busca-dev" placeholder="Buscar cliente por nome ou telefone" value="${esc(fDevedores.termo)}"></div>
    <div class="campo-grupo"><label>Mostrar</label>
      <select data-fd="situacao">
        ${opcao('', fDevedores.situacao, 'Todos os devedores')}
        ${opcao('vencidas', fDevedores.situacao, 'Só com parcelas vencidas')}
        ${opcao('emdia', fDevedores.situacao, 'Só quem está em dia')}
      </select></div>
    <div class="campo-grupo"><label>Ordenar por</label>
      <select data-fd="ordem">
        ${opcao('vencido', fDevedores.ordem, 'Mais vencido')}
        ${opcao('nome', fDevedores.ordem, 'Nome (A–Z)')}
        ${opcao('total', fDevedores.ordem, 'Maior saldo')}
      </select></div>
    ${filtrando ? '<button class="btn btn-p" data-acao="limpar-filtro-devedores">Limpar filtro</button>' : ''}
  </div>

  <div class="grade grade-3 mb">
    ${kpi('Devedores', String(lista.length), filtrando ? `de ${todos.length} no total` : 'clientes com parcela em aberto')}
    ${kpi('Total a receber deles', brl(totalGeral), '', 'destaque')}
    ${kpi('Vencido', brl(totalVencido), totalVencido ? 'cobrar primeiro' : 'nada atrasado')}
  </div>

  <div id="fin-selecao"></div>

  ${!lista.length ? vazio('pessoas', 'Nenhum devedor com esse filtro', 'Ajuste a busca ou o filtro acima.')
    : lista.map((g) => `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer">
        <h3>${g.clienteId ? `<a href="#/cliente/${esc(g.clienteId)}">${esc(g.nome)}</a>` : esc(g.nome)}</h3>
        <div class="texto-2 pequeno">${g.parcelas.length} parcela(s) em aberto
          ${g.nVencidas ? '· ' + tag(g.nVencidas + ' vencida(s) desde ' + dataBR(g.maisAntiga), 'erro') : '· em dia'}</div>
      </div>
      <div style="text-align:right">
        <div class="valor-kpi">${brl(g.total)}</div>
        ${g.vencido ? `<div class="pequeno negativo">${brl(g.vencido)} vencido</div>` : ''}
      </div>
    </div>

    <div class="rolagem-x"><table>
      <thead><tr><th style="width:34px"></th><th>Origem</th><th>Vencimento</th>
        <th class="dir">Valor</th><th class="dir">Pago</th><th class="dir">Falta</th><th></th></tr></thead>
      <tbody>${g.parcelas.map((r) => `<tr>
        <td><label class="caixa-toque"><input type="checkbox" data-sel="${esc(r.id)}"${selecionados.has(r.id) ? ' checked' : ''}></label></td>
        <td>${r.vendaId ? `<a href="#/venda/${esc(r.vendaId)}">${esc(rotuloRecebivel(r))}</a>` : esc(rotuloRecebivel(r))}</td>
        <td>${dataBR(r.vencimento)} ${r.vencimento < hoje ? tag('vencida', 'erro') : ''}
          ${r.status === 'parcial' ? tag('parcial', 'alerta') : ''}</td>
        <td class="dir num">${brl(r.liquido)}</td>
        <td class="dir num">${r.pago ? brl(r.pago) : '—'}</td>
        <td class="dir num negrito">${brl(saldoDe(r))}</td>
        <td class="dir">${acoesParcelaHTML(r)}</td>
      </tr>`).join('')}</tbody>
    </table></div>

    <div class="barra-botoes mt">
      ${g.clienteId ? `<button class="btn" data-extrato="${esc(g.clienteId)}">${icone('documento', 16)} Extrato em PDF</button>` : ''}
      ${g.telefone ? `<a class="btn" target="_blank" rel="noopener" href="${esc(zap(g.telefone))}">${icone('pessoas', 16)} WhatsApp</a>` : ''}
    </div>
  </div>`).join('')}

  <p class="dica">Marque as parcelas para ver o subtotal e imprimir o extrato só delas. Sem marcar nenhuma,
    o extrato do cliente sai com a conta inteira — o que já foi pago e o que falta.</p>`;
}

function ordemDevedores(ordem) {
  if (ordem === 'nome') return (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  if (ordem === 'total') return (a, b) => (b.total - a.total) || (b.vencido - a.vencido);
  return (a, b) => (b.vencido - a.vencido) || (b.total - a.total);
}

/**
 * Desenha a barra de selecao — e' o unico pedaco que muda quando o usuario
 * marca uma parcela. Redesenhar a tela inteira a cada clique fazia a lista
 * inteira pular, e o segundo toque caia na linha errada.
 */
function pintarSelecao(raiz) {
  const alvo = raiz.querySelector('#fin-selecao');
  if (!alvo) return;
  if (!selecionados.size) { alvo.innerHTML = ''; return; }
  const e = log.estado();
  const marcadas = [...selecionados].map((id) => e.recebiveis[id]).filter(Boolean);
  const total = marcadas.reduce((s, r) => s + saldoDe(r), 0);
  // Extrato so' faz sentido de UM cliente: juntar dois numa folha so' viraria
  // um documento que nao se entrega a ninguem.
  const clientes = new Set(marcadas.map((r) => r.clienteId || ''));
  const umCliente = clientes.size === 1 && [...clientes][0];
  alvo.innerHTML = `<div class="barra-selecao">
    <div class="crescer"><strong>${selecionados.size} parcela(s)</strong>
      <div class="texto-2 pequeno">${brl(total)} em aberto</div></div>
    ${umCliente ? '<button class="btn btn-p" data-acao="extrato-selecao">Extrato em PDF</button>' : ''}
    <button class="btn btn-p btn-primario" data-acao="baixar-lote">Marcar como recebidas</button>
    <button class="btn btn-p" data-acao="limpar-selecao">Limpar</button>
  </div>`;
}

function nomeDoCliente(e, r) {
  return r.clienteId && e.clientes[r.clienteId] ? e.clientes[r.clienteId].nome : '';
}

/**
 * Campo de busca: o desenho troca o elemento inteiro, entao o foco e o cursor
 * precisam voltar depois que a tela nova esta' no ar — senao o teclado do
 * celular fecha a cada letra digitada.
 */
function ligarBusca(raiz, redesenhar, seletor, guardar) {
  const campo = raiz.querySelector(seletor);
  if (!campo) return;
  campo.addEventListener('input', debounce(async (ev) => {
    guardar(ev.target.value);
    selecionados.clear();
    await redesenhar();
    const novo = document.querySelector(seletor);
    if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
  }, 220));
}

function ligar(raiz, redesenhar) {
  const e = log.estado();
  pintarSelecao(raiz);

  liga(raiz, 'click', '[data-aba]', (ev, el) => { aba = el.dataset.aba; selecionados.clear(); redesenhar(); });
  liga(raiz, 'change', '[data-de]', (ev, el) => { periodo.de = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-ate]', (ev, el) => { periodo.ate = el.value; redesenhar(); });

  // Mexer no filtro esvazia a selecao: manter marcada uma parcela que saiu da
  // tela faria a barra somar dinheiro que ninguem esta' vendo.
  liga(raiz, 'change', '[data-f]', (ev, el) => {
    fReceber[el.dataset.f] = el.value;
    selecionados.clear();
    redesenhar();
  });
  liga(raiz, 'change', '[data-fd]', (ev, el) => {
    fDevedores[el.dataset.fd] = el.value;
    selecionados.clear();
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="limpar-filtro-receber"]', () => {
    fReceber = { termo: '', situacao: '', tipo: '' };
    selecionados.clear();
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="limpar-filtro-devedores"]', () => {
    fDevedores = { termo: '', situacao: '', ordem: fDevedores.ordem };
    selecionados.clear();
    redesenhar();
  });

  ligarBusca(raiz, redesenhar, '#fin-busca', (v) => { fReceber.termo = v; });
  ligarBusca(raiz, redesenhar, '#fin-busca-dev', (v) => { fDevedores.termo = v; });

  liga(raiz, 'change', '[data-sel]', (ev, el) => {
    if (el.checked) selecionados.add(el.dataset.sel); else selecionados.delete(el.dataset.sel);
    pintarSelecao(raiz);
  });
  liga(raiz, 'click', '[data-acao="limpar-selecao"]', () => {
    selecionados.clear();
    for (const c of raiz.querySelectorAll('[data-sel]')) c.checked = false;
    pintarSelecao(raiz);
  });

  liga(raiz, 'click', '[data-acao="baixar-lote"]', async () => {
    const ids = [...selecionados];
    if (!ids.length) return;
    const total = ids.map((id) => e.recebiveis[id]).filter(Boolean).reduce((s, r) => s + saldoDe(r), 0);
    const ok = await confirmar('Marcar como recebidas',
      `${ids.length} parcela(s), ${brl(total)} líquidos, entram no caixa de hoje (${dataBR(iso())}).`,
      { textoOk: 'Marcar' });
    if (!ok) return;
    // Limpa a selecao ANTES de gravar: a gravacao dispara o redesenho da tela,
    // e ele precisa encontrar a selecao ja' vazia, senao a barra fica na tela
    // anunciando parcelas que acabaram de ser baixadas.
    selecionados.clear();
    pintarSelecao(raiz);
    await acoes.baixarVarios(ids, '', iso());
    toast(`${ids.length} recebimento(s) baixado(s).`, 'ok');
  });

  liga(raiz, 'click', '[data-receber]', (ev, el) => {
    const r = e.recebiveis[el.dataset.receber];
    if (!r) return;
    abrirRecebimento({ recebivel: r, nomeCliente: nomeDoCliente(e, r) });
  });
  liga(raiz, 'click', '[data-editar]', (ev, el) => {
    const atual = log.estado();
    const r = atual.recebiveis[el.dataset.editar];
    if (!r) return;
    abrirEdicaoParcela({ recebivel: r, nomeCliente: nomeDoCliente(atual, r) });
  });
  liga(raiz, 'click', '[data-extrato]', (ev, el) => {
    imprimirFolha(extratoCliente(log.estado(), el.dataset.extrato));
  });
  liga(raiz, 'click', '[data-acao="extrato-selecao"]', () => {
    const ids = [...selecionados];
    const marcadas = ids.map((id) => log.estado().recebiveis[id]).filter(Boolean);
    if (!marcadas.length) return;
    imprimirFolha(extratoCliente(log.estado(), marcadas[0].clienteId, ids));
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
}
