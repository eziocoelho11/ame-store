// relatorios.js — as perguntas que decidem a proxima compra.
import * as log from '../../core/eventlog.js';
import { desempenhoPorItem, curvaABC, giroEstoque, receitaPorCategoria, padraoDeVenda, valorEstoque } from '../../domain/consultas.js';
import { brl, esc, pct, num, iso, competencia, limitesDaCompetencia, DIAS_SEMANA } from '../../core/fmt.js';
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
  if (!itens.length && aba !== 'giro') {
    return vazio('grafico', 'Sem vendas no período', 'Ajuste as datas acima.');
  }
  if (aba === 'vendidos') return abaVendidos(itens);
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
      <thead><tr><th>Peça</th><th class="dir">Qtd</th><th class="dir">Receita</th>
        <th class="dir">Custo</th><th class="dir">Margem</th><th class="dir">%</th></tr></thead>
      <tbody>${itens.map((i) => `<tr>
        <td>${esc(i.rotulo)}</td><td class="dir num">${i.qtd}</td>
        <td class="dir num">${brl(i.receita)}</td><td class="dir num texto-3">${brl(i.custo)}</td>
        <td class="dir num">${brl(i.margem)}</td><td class="dir pct">${pct(i.margemPct)}</td></tr>`).join('')}
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
      <thead><tr><th>Peça</th><th>Classe</th><th class="dir">Receita</th>
        <th class="dir">% do total</th><th class="dir">Acumulado</th></tr></thead>
      <tbody>${abc.map((i) => `<tr>
        <td>${esc(i.rotulo)}</td>
        <td>${tag(i.classe, i.classe === 'A' ? 'ok' : i.classe === 'B' ? 'info' : 'alerta')}</td>
        <td class="dir num">${brl(i.receita)}</td>
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
        <th class="dir">Cobertura</th><th class="dir">Parado (custo)</th></tr></thead>
      <tbody>${giro.map((g) => `<tr>
        <td>${esc(g.rotulo)}</td>
        <td class="dir num">${g.saldo}</td>
        <td class="dir num">${g.vendido}</td>
        <td class="dir">${g.coberturaDias === null ? tag('não vendeu', 'alerta')
          : g.coberturaDias === 0 ? '—'
          : `<span class="${g.coberturaDias <= 15 ? 'negativo' : ''}">${g.coberturaDias} dias</span>`}</td>
        <td class="dir num texto-3">${brl(g.saldo * g.custoMedio)}</td></tr>`).join('')}
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
      <thead><tr><th>Categoria</th><th class="dir">Peças</th><th class="dir">Receita</th>
        <th class="dir">Custo</th><th class="dir">Margem</th><th class="dir">%</th></tr></thead>
      <tbody>${cats.map((c) => `<tr>
        <td>${esc(c.categoria)}</td><td class="dir num">${c.qtd}</td>
        <td class="dir num">${brl(c.receita)}</td><td class="dir num texto-3">${brl(c.custo)}</td>
        <td class="dir num">${brl(c.margem)}</td>
        <td class="dir pct">${pct(c.receita > 0 ? (c.margem / c.receita) * 100 : null)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>`;
}

function abaQuando(e) {
  const p = padraoDeVenda(e, periodo.de, periodo.ate);
  return `
  <div class="cartao"><h3>Por dia da semana</h3>
    ${grafBarras(p.semana.map((s, i) => ({ rotulo: DIAS_SEMANA[i].slice(0, 3), valor: s.receita })),
      { formato: (v) => brl(v).replace('R$ ', '') })}</div>
  <div class="cartao"><h3>Por hora do dia</h3>
    ${grafBarras(p.horas.map((h, i) => ({ rotulo: String(i).padStart(2, '0'), valor: h.receita }))
      .filter((h, i) => i >= 7 && i <= 22), { formato: (v) => brl(v).replace('R$ ', '') })}
    <p class="dica">Serve para decidir horário de funcionamento e quando publicar no Instagram.</p></div>`;
}

function ligar(raiz, redesenhar) {
  liga(raiz, 'change', '[data-de]', (ev, el) => { periodo.de = el.value; redesenhar(); });
  liga(raiz, 'change', '[data-ate]', (ev, el) => { periodo.ate = el.value; redesenhar(); });
  liga(raiz, 'click', '[data-aba]', (ev, el) => { aba = el.dataset.aba; redesenhar(); });
  liga(raiz, 'click', '[data-acao="csv"]', () => {
    const e = log.estado();
    const itens = aba === 'giro'
      ? giroEstoque(e, periodo.de, periodo.ate).map((g) => [g.rotulo, g.saldo, g.vendido,
        g.coberturaDias === null ? 'não vendeu' : g.coberturaDias, csvMoeda(g.saldo * g.custoMedio)])
      : desempenhoPorItem(e, periodo.de, periodo.ate).map((i) => [i.rotulo, i.categoria, i.qtd,
        csvMoeda(i.receita), csvMoeda(i.custo), csvMoeda(i.margem),
        i.margemPct === null ? '' : i.margemPct.toFixed(1).replace('.', ',')]);
    const cabecalho = aba === 'giro'
      ? ['Peça', 'Saldo', 'Vendidas', 'Cobertura (dias)', 'Parado a custo']
      : ['Peça', 'Categoria', 'Qtd', 'Receita', 'Custo', 'Margem', 'Margem %'];
    baixarArquivo(`AME Store - relatório ${aba} ${periodo.de} a ${periodo.ate}.csv`,
      paraCSV(cabecalho, itens), 'text/csv');
    toast('Arquivo gerado.', 'ok');
  });
}
