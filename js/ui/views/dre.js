// dre.js — a demonstracao do resultado, mes a mes e comparada.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { calcularDRE } from '../../domain/dre.js';
import { brl, esc, pct, iso, competencia, competenciaBR, competenciaCurta, ultimasCompetencias, num } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, paraCSV, csvMoeda, baixarArquivo, modalFormulario , vista } from '../ui.js';
import { barras as grafBarras } from '../graficos.js';

let comp = competencia(iso());
let modo = 'mes';

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function opcoesDeMes() {
  const e = log.estado();
  const datas = Object.values(e.vendas).map((v) => v.data.slice(0, 7))
    .concat(Object.values(e.despesas).map((d) => d.competencia));
  const atual = competencia(iso());
  const conjunto = new Set([...datas, atual, comp]);
  return [...conjunto].filter(Boolean).sort().reverse();
}

function html() {
  const e = log.estado();
  const d = calcularDRE(e, comp);
  const meses = opcoesDeMes();

  return `
  <div class="filtros">
    <div class="campo-grupo"><label>Competência</label>
      <select data-mes>${meses.map((m) => `<option value="${m}"${m === comp ? ' selected' : ''}>${competenciaBR(m)}</option>`).join('')}</select></div>
    <div class="pilulas" style="align-self:flex-end">
      <button class="pilula ${modo === 'mes' ? 'ativa' : ''}" data-modo="mes">Mês</button>
      <button class="pilula ${modo === 'ano' ? 'ativa' : ''}" data-modo="ano">12 meses</button>
    </div>
    <div class="crescer"></div>
    <button class="btn" data-acao="csv">${icone('documento', 16)} CSV</button>
    <button class="btn" data-acao="imprimir">${icone('imprimir', 16)} Imprimir</button>
  </div>

  ${modo === 'mes' ? mesHTML(e, d) : anoHTML(e)}`;
}

function linhaDRE(rotulo, valor, d, { classe = '', recuo = false, sinal = null } = {}) {
  const p = d.receitaBruta > 0 ? (valor / d.receitaBruta) * 100 : null;
  const texto = sinal === '-' ? '− ' + brl(Math.abs(valor)) : brl(valor);
  return `<tr class="${classe}">
    <td class="${recuo ? 'recuo' : ''} ${classe ? '' : 'rubrica'}">${rotulo}</td>
    <td class="dir num">${texto}</td>
    <td class="dir pct">${p === null ? '' : pct(p)}</td></tr>`;
}

function mesHTML(e, d) {
  const categorias = Object.entries(d.porCategoria).sort((a, b) => b[1] - a[1]);

  return `
  <div class="grade grade-4 mb">
    ${kpi('Receita bruta', brl(d.receitaBruta), `${d.nVendas} vendas · ticket ${brl(d.ticketMedio)}`)}
    ${kpi('Lucro bruto', brl(d.lucroBruto), 'margem ' + pct(d.margemBruta))}
    ${kpi('Resultado', brl(d.resultado), 'margem ' + pct(d.margemLiquida), d.resultado >= 0 ? '' : '')}
    ${kpi('Ponto de equilíbrio', d.pontoEquilibrio === null ? '—' : brl(d.pontoEquilibrio),
      d.pontoEquilibrio === null ? 'sem dados suficientes'
        : d.receitaBruta >= d.pontoEquilibrio ? 'já superado neste mês' : 'faltam ' + brl(d.pontoEquilibrio - d.receitaBruta))}
  </div>

  <div class="cartao">
    <h3>DRE · ${competenciaBR(d.competencia)}</h3>
    <table class="dre">
      <tbody>
        ${linhaDRE('Vendas a preço de tabela', d.vendasBruto, d)}
        ${d.descontos ? linhaDRE('Descontos concedidos', -d.descontos, d, { recuo: true, sinal: '-' }) : ''}
        ${d.freteCobrado ? linhaDRE('Frete cobrado do cliente', d.freteCobrado, d, { recuo: true }) : ''}
        ${linhaDRE('<strong>Receita bruta</strong>', d.receitaBruta, d, { classe: 'subtotal' })}
        ${d.devolucoes ? linhaDRE('Devoluções e trocas', -d.devolucoes, d, { recuo: true, sinal: '-' }) : ''}
        ${linhaDRE('Taxas de cartão', -d.taxasCartao, d, { recuo: true, sinal: '-' })}
        ${d.comissoes ? linhaDRE('Comissões de canal', -d.comissoes, d, { recuo: true, sinal: '-' }) : ''}
        ${linhaDRE('DAS-MEI' + (d.impostoEstimado && d.imposto ? ' <span class="tag tag-alerta">estimado</span>' : ''), -d.imposto, d, { recuo: true, sinal: '-' })}
        ${linhaDRE('<strong>Receita líquida</strong>', d.receitaLiquida, d, { classe: 'subtotal' })}
        ${linhaDRE('Custo das mercadorias vendidas (CMV)', -d.cmv, d, { recuo: true, sinal: '-' })}
        ${linhaDRE('<strong>Lucro bruto</strong>', d.lucroBruto, d, { classe: 'subtotal' })}
        ${linhaDRE('Despesas fixas', -d.fixas, d, { recuo: true, sinal: '-' })}
        ${linhaDRE('Despesas variáveis', -d.variaveis, d, { recuo: true, sinal: '-' })}
        ${linhaDRE('<strong>Resultado do período</strong>', d.resultado, d, { classe: 'resultado' })}
      </tbody>
    </table>
    <p class="dica mt">
      Regime de competência: a venda entra no mês em que aconteceu, mesmo que o dinheiro do cartão caia depois
      ou que o fiado tenha sido parcelado em 6×. Parcelar não muda o resultado do mês — muda quando o dinheiro
      entra. Para isso, veja o <a href="#/financeiro">Financeiro</a>.
    </p>
  </div>

  <div class="grade grade-2">
    <div class="cartao">
      <h3>Despesas por categoria</h3>
      ${categorias.length ? `<table><tbody>${categorias.map(([c, v]) => `
        <tr><td>${esc(c)}</td><td class="dir num">${brl(v)}</td>
        <td class="dir pct">${pct(d.despesas > 0 ? (v / d.despesas) * 100 : 0)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td>Total</td><td class="dir num">${brl(d.despesas)}</td><td></td></tr></tfoot></table>`
        : '<p class="texto-3 pequeno">Nenhuma despesa lançada neste mês.</p>'}
    </div>

    <div class="cartao">
      <h3>Margem por canal</h3>
      ${d.porCanal.length ? `<div class="rolagem-x"><table>
        <thead><tr><th>Canal</th><th class="dir">Receita</th><th class="dir">Margem</th><th class="dir">%</th></tr></thead>
        <tbody>${d.porCanal.sort((a, b) => b.receita - a.receita).map((c) => {
          const margem = c.receita - c.cmv - c.taxas - c.comissao;
          return `<tr><td>${esc(c.nome)}<br><span class="texto-3 pequeno">${c.vendas} vendas</span></td>
            <td class="dir num">${brl(c.receita)}</td>
            <td class="dir num">${brl(margem)}</td>
            <td class="dir pct">${pct(c.receita > 0 ? (margem / c.receita) * 100 : 0)}</td></tr>`;
        }).join('')}</tbody></table></div>`
        : '<p class="texto-3 pequeno">Sem vendas neste mês.</p>'}
      <p class="dica">Margem aqui já desconta CMV, taxa de cartão e comissão do canal.</p>
    </div>
  </div>

  <div class="cartao nao-imprimir">
    <div class="cartao-cabecalho"><h3>Imposto do mês</h3></div>
    <p class="texto-2 pequeno">${d.impostoEstimado
      ? 'Nenhum DAS lançado nesta competência — a DRE está usando o valor configurado em Ajustes.'
      : 'DAS lançado nesta competência.'}</p>
    <button class="btn" data-acao="lancar-das">${icone('mais', 16)} Lançar DAS pago</button>
  </div>`;
}

function anoHTML(e) {
  const meses = ultimasCompetencias(comp, 12);
  const serie = meses.map((m) => calcularDRE(e, m));
  const soma = (campo) => serie.reduce((s, d) => s + d[campo], 0);
  const receita = soma('receitaBruta');
  const resultado = soma('resultado');

  const linhas = [
    ['Receita bruta', 'receitaBruta'],
    ['Devoluções', 'devolucoes'],
    ['Taxas de cartão', 'taxasCartao'],
    ['Comissões', 'comissoes'],
    ['DAS-MEI', 'imposto'],
    ['Receita líquida', 'receitaLiquida'],
    ['CMV', 'cmv'],
    ['Lucro bruto', 'lucroBruto'],
    ['Despesas fixas', 'fixas'],
    ['Despesas variáveis', 'variaveis'],
    ['Resultado', 'resultado'],
  ];

  return `
  <div class="grade grade-4 mb">
    ${kpi('Receita 12 meses', brl(receita))}
    ${kpi('Resultado 12 meses', brl(resultado), 'margem ' + pct(receita > 0 ? (resultado / receita) * 100 : null))}
    ${kpi('CMV acumulado', brl(soma('cmv')))}
    ${kpi('Despesas acumuladas', brl(soma('despesas')), num(soma('nVendas')) + ' vendas no período')}
  </div>

  <div class="cartao">
    <h3>Resultado mês a mês</h3>
    ${grafBarras(serie.map((d) => ({ rotulo: competenciaCurta(d.competencia), valor: d.resultado })),
      { formato: (v) => brl(v).replace('R$ ', '') })}
  </div>

  <div class="cartao">
    <h3>Comparativo</h3>
    <div class="rolagem-x"><table class="dre">
      <thead><tr><th>Rubrica</th>${serie.map((d) => `<th class="dir">${competenciaCurta(d.competencia)}</th>`).join('')}<th class="dir">Total</th></tr></thead>
      <tbody>${linhas.map(([rotulo, campo]) => {
        const destaque = ['Receita líquida', 'Lucro bruto', 'Resultado'].includes(rotulo);
        return `<tr class="${destaque ? 'subtotal' : ''}">
          <td>${rotulo}</td>
          ${serie.map((d) => `<td class="dir num">${brl(d[campo])}</td>`).join('')}
          <td class="dir num negrito">${brl(soma(campo))}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
}

function ligar(raiz, redesenhar) {
  liga(raiz, 'change', '[data-mes]', (ev, el) => { comp = el.value; redesenhar(); });
  liga(raiz, 'click', '[data-modo]', (ev, el) => { modo = el.dataset.modo; redesenhar(); });
  liga(raiz, 'click', '[data-acao="imprimir"]', () => window.print());
  liga(raiz, 'click', '[data-acao="csv"]', () => exportar());
  liga(raiz, 'click', '[data-acao="lancar-das"]', () => {
    const e = log.estado();
    modalFormulario({
      titulo: 'Lançar DAS pago — ' + competenciaBR(comp),
      campos: [
        { nome: 'valor', rotulo: 'Valor pago', tipo: 'moeda', obrigatorio: true,
          valor: (e.config.mei && e.config.mei.dasMensal) || 0,
          dica: 'O valor que consta na guia, não uma estimativa.' },
        { nome: 'data', rotulo: 'Data do pagamento', tipo: 'data', obrigatorio: true, valor: iso() },
      ],
      aoSalvar: async (d, fechar) => {
        await acoes.lancarImposto({ comp, valor: d.valor, data: d.data });
        fechar(); toast('DAS lançado.', 'ok');
      },
    });
  });
}

function exportar() {
  const e = log.estado();
  const meses = modo === 'mes' ? [comp] : ultimasCompetencias(comp, 12);
  const serie = meses.map((m) => calcularDRE(e, m));
  const rubricas = [
    ['Vendas a preço de tabela', 'vendasBruto'], ['Descontos', 'descontos'],
    ['Frete cobrado', 'freteCobrado'], ['Receita bruta', 'receitaBruta'],
    ['Devoluções', 'devolucoes'], ['Taxas de cartão', 'taxasCartao'],
    ['Comissões de canal', 'comissoes'], ['DAS-MEI', 'imposto'],
    ['Receita líquida', 'receitaLiquida'], ['CMV', 'cmv'], ['Lucro bruto', 'lucroBruto'],
    ['Despesas fixas', 'fixas'], ['Despesas variáveis', 'variaveis'], ['Resultado', 'resultado'],
    ['Nº de vendas', 'nVendas'], ['Ticket médio', 'ticketMedio'],
  ];
  const csv = paraCSV(
    ['Rubrica', ...serie.map((d) => competenciaBR(d.competencia))],
    rubricas.map(([rotulo, campo]) => [rotulo, ...serie.map((d) => (campo === 'nVendas' ? d[campo] : csvMoeda(d[campo])))])
  );
  baixarArquivo(`AME Store - DRE ${meses[0]}${meses.length > 1 ? ' a ' + meses[meses.length - 1] : ''}.csv`, csv, 'text/csv');
  toast('Arquivo gerado.', 'ok');
}
