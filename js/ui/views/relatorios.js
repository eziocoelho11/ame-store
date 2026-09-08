// relatorios.js — as perguntas que decidem a proxima compra.
import * as log from '../../core/eventlog.js';
import { desempenhoPorItem, curvaABC, giroEstoque, receitaPorCategoria, padraoDeVenda, valorEstoque,
  desempenhoPorCanal, pontoFixoVsFora } from '../../domain/consultas.js';
import { brl, brlSimples, esc, pct, num, iso, competencia, limitesDaCompetencia, DIAS_SEMANA } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, vazio, tag, paraCSV, csvMoeda, baixarArquivo , vista } from '../ui.js';
import { ranking, rosca, barras as grafBarras } from '../graficos.js';

let aba = 'vendidos';
let periodo = null;

export async function render(raiz) {
  if (!periodo) {
    const { inicio, fim } = limitesDaCompetencia(competencia(iso()));
    periodo = { de: inicio, ate: fim };
  }
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

const ABAS = [
  ['vendidos', 'Mais vendidos'],
  ['canal', 'Onde vende'],
  ['abc', 'Curva ABC'],
  ['giro', 'Giro e cobertura'],
  ['categoria', 'Por categoria'],
  ['quando', 'Quando vende'],
];

function html() {
  const e = log.estado();
  return `
  <div class="filtros">
    <div class="campo-grupo"><label>De</label><input type="date" data-de value="${periodo.de}"></div>
    <div class="campo-grupo"><label>Até</label><input type="date" data-ate value="${periodo.ate}"></div>
    <div class="crescer"></div>
    <button class="btn" data-acao="csv">${icone('documento', 16)} CSV</button>
  </div>
  <div class="pilulas mb">
    ${ABAS.map(([id, nome]) => `<button class="pilula ${aba === id ? 'ativa' : ''}" data-aba="${id}">${nome}</button>`).join('')}
  </div>
  ${conteudo(e)}`;
}

function conteudo(e) {
  const itens = desempenhoPorItem(e, periodo.de, periodo.ate);
  if (!itens.length && aba !== 'giro' && aba !== 'canal') {
    return vazio('grafico', 'Sem vendas no período', 'Ajuste as datas acima.');
  }
  if (aba === 'vendidos') return abaVendidos(itens);
  if (aba === 'canal') return abaCanal(e);
  if (aba === 'abc') return abaABC(e);
  if (aba === 'giro') return abaGiro(e);
  if (aba === 'categoria') return abaCategoria(e);
  return abaQuando(e);
}

function abaVendidos(itens) {
  const porQtd = [...itens].sort((a, b) => b.qtd - a.qtd);
  return `
  <div class="grade grade-2">
    <div class="cartao"><h3>Quem mais faturou</h3>
      ${ranking(itens.map((i) => ({ rotulo: i.rotulo, valor: i.receita })))}</div>
    <div class="cartao"><h3>Quem mais saiu (peças)</h3>
      ${ranking(porQtd.map((i) => ({ rotulo: i.rotulo, valor: i.qtd })), { formato: (v) => num(v) + ' un' })}</div>
  </div>
  <div class="cartao">
    <h3>Detalhe</h3>
    <div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir">Qtd</th><th class="dir">Receita (R$)</th>
        <th class="dir">Custo (R$)</th><th class="dir">Margem (R$)</th><th class="dir">%</th></tr></thead>
      <tbody>${itens.map((i) => `<tr>
        <td>${esc(i.rotulo)}</td><td class="dir num">${i.qtd}</td>
        <td class="dir num">${brlSimples(i.receita)}</td><td class="dir num texto-3">${brlSimples(i.custo)}</td>
        <td class="dir num">${brlSimples(i.margem)}</td><td class="dir pct">${pct(i.margemPct)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>`;
}

function abaABC(e) {
  const abc = curvaABC(e, periodo.de, periodo.ate);
  const conta = (c) => abc.filter((i) => i.classe === c).length;
  const soma = (c) => abc.filter((i) => i.classe === c).reduce((s, i) => s + i.receita, 0);
  return `
  <div class="grade grade-3 mb">
    ${kpi('Classe A', conta('A') + ' itens', brl(soma('A')) + ' — os primeiros 80% do faturamento', 'destaque')}
    ${kpi('Classe B', conta('B') + ' itens', brl(soma('B')))}
    ${kpi('Classe C', conta('C') + ' itens', brl(soma('C')) + ' — os últimos 5%')}
  </div>
  <div class="cartao">
    <p class="dica">Classe A é o que sustenta a loja: reponha sempre. Classe C ocupa arara e dinheiro parado — bom candidato a promoção e a não recomprar.</p>
    <div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th>Classe</th><th class="dir">Receita (R$)</th>
        <th class="dir">% do total</th><th class="dir">Acumulado</th></tr></thead>
      <tbody>${abc.map((i) => `<tr>
        <td>${esc(i.rotulo)}</td>
        <td>${tag(i.classe, i.classe === 'A' ? 'ok' : i.classe === 'B' ? 'info' : 'alerta')}</td>
        <td class="dir num">${brlSimples(i.receita)}</td>
        <td class="dir pct">${pct(i.pctReceita)}</td>
        <td class="dir pct">${pct(i.pctAcum)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>`;
}

function abaGiro(e) {
  const giro = giroEstoque(e, periodo.de, periodo.ate);
  const parado = giro.filter((g) => g.saldo > 0 && g.vendido === 0);
  const estoque = valorEstoque(e);
  return `
  <div class="grade grade-3 mb">
    ${kpi('Estoque parado', num(parado.length) + ' itens',
      brl(parado.reduce((s, g) => s + g.saldo * g.custoMedio, 0)) + ' sem vender no período')}
    ${kpi('Valor em estoque', brl(estoque.custo), num(estoque.unidades) + ' peças')}
    ${kpi('Vendidas no período', num(giro.reduce((s, g) => s + g.vendido, 0)) + ' peças')}
  </div>
  <div class="cartao">
    <p class="dica">Cobertura responde: no ritmo atual, em quantos dias essa peça acaba. Abaixo de 15 dias, é hora de repor.</p>
    <div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir">Saldo</th><th class="dir">Vendidas</th>
        <th class="dir">Cobertura</th><th class="dir">Parado (R$ de custo)</th></tr></thead>
      <tbody>${giro.map((g) => `<tr>
        <td>${esc(g.rotulo)}</td>
        <td class="dir num">${g.saldo}</td>
        <td class="dir num">${g.vendido}</td>
        <td class="dir">${g.coberturaDias === null ? tag('não vendeu', 'alerta')
          : g.coberturaDias === 0 ? '—'
          : `<span class="${g.coberturaDias <= 15 ? 'negativo' : ''}">${g.coberturaDias} dias</span>`}</td>
        <td class="dir num texto-3">${brlSimples(g.saldo * g.custoMedio)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>`;
}

function abaCategoria(e) {
  const cats = receitaPorCategoria(e, periodo.de, periodo.ate);
  return `
  <div class="grade grade-2">
    <div class="cartao"><h3>Receita por categoria</h3>
      ${rosca(cats.map((c) => ({ rotulo: c.categoria, valor: c.receita })))}</div>
    <div class="cartao"><h3>Margem por categoria</h3>
      ${ranking(cats.map((c) => ({ rotulo: c.categoria, valor: c.margem })))}</div>
  </div>
  <div class="cartao">
    <div class="rolagem-x"><table>
      <thead><tr><th>Categoria</th><th class="dir">Peças</th><th class="dir">Receita (R$)</th>
        <th class="dir">Custo (R$)</th><th class="dir">Margem (R$)</th><th class="dir">%</th></tr></thead>
      <tbody>${cats.map((c) => `<tr>
        <td>${esc(c.categoria)}</td><td class="dir num">${c.qtd}</td>
        <td class="dir num">${brlSimples(c.receita)}</td><td class="dir num texto-3">${brlSimples(c.custo)}</td>
        <td class="dir num">${brlSimples(c.margem)}</td>
        <td class="dir pct">${pct(c.receita > 0 ? (c.margem / c.receita) * 100 : null)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>`;
}

/**
 * "Onde vende": balcao contra venda por fora. E' a aba que serve a uma decisao
 * de verdade — manter ou nao o ponto fixo —, entao mostra os dois lados e diz
 * em voz alta o que ela NAO sabe responder.
 */
function abaCanal(e) {
  const canais = desempenhoPorCanal(e, periodo.de, periodo.ate);
  const cmp = pontoFixoVsFora(e, periodo.de, periodo.ate);
  const comVenda = canais.filter((c) => c.nVendas > 0);

  if (!comVenda.length) {
    return vazio('loja', 'Sem vendas no período',
      'Ajuste as datas acima. Quando houver venda, aqui aparece quanto veio do balcão e quanto veio de fora.');
  }

  const lado = (titulo, bloco, participacao, classe) => `
    <div class="cartao ${classe}">
      <h3>${titulo}</h3>
      <div class="valor-kpi">${brl(bloco.receita)}</div>
      <div class="nota-kpi">${participacao === null ? '—' : pct(participacao)} da receita do período
        · ${bloco.nVendas} venda(s) · ${num(bloco.pecas)} peças</div>
      <table><tbody>
        <tr><td>Margem</td><td class="dir num">${brlSimples(bloco.margem)}</td></tr>
        <tr><td>Margem %</td><td class="dir pct">${pct(bloco.margemPct)}</td></tr>
        <tr><td>Ticket médio</td><td class="dir num">${brlSimples(bloco.ticket)}</td></tr>
      </tbody></table>
      ${bloco.canais.filter((c) => c.nVendas > 0).length
        ? `<div class="texto-3 pequeno">${bloco.canais.filter((c) => c.nVendas > 0)
            .map((c) => esc(c.nome)).join(' · ')}</div>` : ''}
    </div>`;

  return `
  <div class="grade grade-2">
    ${lado('No ponto físico', cmp.ponto, cmp.participacaoPonto,
      cmp.ponto.receita >= cmp.fora.receita ? 'destaque' : '')}
    ${lado('Por fora da loja', cmp.fora, cmp.participacaoFora,
      cmp.fora.receita > cmp.ponto.receita ? 'destaque' : '')}
  </div>

  <div class="cartao">
    <h3>O ponto fixo se paga?</h3>
    <table><tbody>
      <tr><td>Margem do que vendeu no balcão</td><td class="dir num">${brlSimples(cmp.ponto.margem)}</td></tr>
      <tr><td>Despesas fixas do período</td><td class="dir num negativo">− ${brlSimples(cmp.fixas)}</td></tr>
      <tr class="subtotal"><td><strong>Sobra</strong></td>
        <td class="dir num negrito ${cmp.margemPontoMenosFixas < 0 ? 'negativo' : 'positivo'}">
          ${brlSimples(cmp.margemPontoMenosFixas)}</td></tr>
    </tbody></table>
    <p class="dica"><strong>Este número abre a conversa, não a encerra.</strong>
      ${cmp.margemPontoMenosFixas < 0
        ? 'A margem do balcão sozinha não cobriu as despesas fixas do período.'
        : 'A margem do balcão cobriu as despesas fixas do período.'}
      Mas parte do que se vende por fora <strong>nasce da vitrine</strong> — a cliente que foi abordada na rua
      já conhecia a loja —, e boa parte da despesa fixa continuaria existindo sem o balcão (estoque em algum
      lugar, energia, internet). O app <strong>não rateia aluguel entre canais</strong> de propósito: qualquer
      rateio seria número inventado com cara de resposta. Olhe a tendência de vários meses, não um mês só.</p>
  </div>

  <div class="grade grade-2">
    <div class="cartao"><h3>Receita por canal</h3>
      ${rosca(comVenda.map((c) => ({ rotulo: c.nome, valor: c.receita })))}</div>
    <div class="cartao"><h3>Margem por canal</h3>
      ${ranking(comVenda.map((c) => ({ rotulo: c.nome, valor: c.margem })))}</div>
  </div>

  <div class="cartao">
    <h3>Detalhe por canal</h3>
    <div class="rolagem-x"><table>
      <thead><tr><th>Canal</th><th class="dir">Vendas</th><th class="dir">Peças</th>
        <th class="dir">Receita (R$)</th><th class="dir">% receita</th>
        <th class="dir">Ticket (R$)</th><th class="dir">Margem (R$)</th><th class="dir">%</th></tr></thead>
      <tbody>${canais.map((c) => `<tr${c.nVendas ? '' : ' style="opacity:.5"'}>
        <td>${esc(c.nome)}</td>
        <td class="dir num">${c.nVendas}</td>
        <td class="dir num">${num(c.pecas)}</td>
        <td class="dir num">${brlSimples(c.receita)}</td>
        <td class="dir pct">${pct(c.participacao)}</td>
        <td class="dir num">${brlSimples(c.ticket)}</td>
        <td class="dir num">${brlSimples(c.margem)}</td>
        <td class="dir pct">${pct(c.margemPct)}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="dica">Margem já desconta CMV, taxa de maquininha e comissão do canal. Canal sem venda no
      período aparece apagado — "não vendeu nada aqui" também é resposta. Para separar o balcão do resto,
      o app usa o canal <strong>Loja física</strong>; os outros contam como venda por fora.</p>
  </div>`;
}

function abaQuando(e) {
  const p = padraoDeVenda(e, periodo.de, periodo.ate);
  return `
  <div class="cartao"><h3>Por dia da semana</h3>
    ${grafBarras(p.semana.map((s, i) => ({ rotulo: DIAS_SEMANA[i].slice(0, 3), valor: s.receita })),
      { formato: (v) => brlSimples(v) })}</div>
  <div class="cartao"><h3>Por hora do dia</h3>
    ${grafBarras(p.horas.map((h, i) => ({ rotulo: String(i).padStart(2, '0'), valor: h.receita }))
      .filter((h, i) => i >= 7 && i <= 22), { formato: (v) => brlSimples(v) })}
    <p class="dica">Serve para decidir horário de funcionamento e quando publicar no Instagram.</p></div>`;
}

function ligar(raiz, redesenhar) {
  liga(raiz, 'change', '[data-de]', (ev, el) => { periodo.de = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-ate]', (ev, el) => { periodo.ate = el.value; redesenhar(); });
  liga(raiz, 'click', '[data-aba]', (ev, el) => { aba = el.dataset.aba; redesenhar(); });
  liga(raiz, 'click', '[data-acao="csv"]', () => {
    const e = log.estado();
    const umDecimal = (v) => (v === null ? '' : v.toFixed(1).replace('.', ','));
    const itens = aba === 'giro'
      ? giroEstoque(e, periodo.de, periodo.ate).map((g) => [g.rotulo, g.saldo, g.vendido,
        g.coberturaDias === null ? 'não vendeu' : g.coberturaDias, csvMoeda(g.saldo * g.custoMedio)])
      : aba === 'canal'
        ? desempenhoPorCanal(e, periodo.de, periodo.ate).map((c) => [c.nome, c.nVendas, c.pecas,
          csvMoeda(c.receita), umDecimal(c.participacao), csvMoeda(c.ticket),
          csvMoeda(c.cmv), csvMoeda(c.taxas), csvMoeda(c.margem), umDecimal(c.margemPct)])
        : desempenhoPorItem(e, periodo.de, periodo.ate).map((i) => [i.rotulo, i.categoria, i.qtd,
          csvMoeda(i.receita), csvMoeda(i.custo), csvMoeda(i.margem), umDecimal(i.margemPct)]);
    const cabecalho = aba === 'giro'
      ? ['Peça', 'Saldo', 'Vendidas', 'Cobertura (dias)', 'Parado a custo']
      : aba === 'canal'
        ? ['Canal', 'Vendas', 'Peças', 'Receita', '% receita', 'Ticket médio', 'CMV', 'Taxas', 'Margem', 'Margem %']
        : ['Peça', 'Categoria', 'Qtd', 'Receita', 'Custo', 'Margem', 'Margem %'];
    baixarArquivo(`AME Store - relatório ${aba} ${periodo.de} a ${periodo.ate}.csv`,
      paraCSV(cabecalho, itens), 'text/csv');
    toast('Arquivo gerado.', 'ok');
  });
}
