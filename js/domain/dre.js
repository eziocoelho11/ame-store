// dre.js — Demonstracao do Resultado do Exercicio, em regime de COMPETENCIA.
//
// Competencia = o resultado aparece no mes em que a venda aconteceu, mesmo que
// o dinheiro do cartao so' caia daqui a 60 dias. E' isso que mostra se a loja
// da' lucro. Quando o dinheiro entra e' outra pergunta, respondida pelo fluxo
// de caixa (financeiro.js) — e a diferenca entre as duas e' o que quebra loja
// lucrativa.
//
// Duas escolhas contabeis que valem explicacao:
//  - Taxa de maquininha e comissao de marketplace entram como DEDUCAO DA
//    RECEITA, nao como despesa operacional. Assim a margem por canal fica
//    verdadeira: a mesma peca rende menos no marketplace do que no balcao.
//  - Devolucao entra no mes em que a devolucao ocorreu, nao no mes da venda.
//    Estornar o mes ja' fechado bagunca o historico.

import { limitesDaCompetencia } from '../core/fmt.js';

export function calcularDRE(estado, comp) {
  const { inicio, fim } = limitesDaCompetencia(comp);
  const dentro = (d) => d >= inicio && d <= fim;

  let vendasBruto = 0, descontos = 0, freteCobrado = 0, receitaBruta = 0;
  let taxasCartao = 0, comissoes = 0, cmv = 0, itens = 0, nVendas = 0;
  const porCanal = {};

  for (const v of Object.values(estado.vendas)) {
    if (v.status === 'cancelada' || !dentro(v.data)) continue;
    nVendas++;
    vendasBruto += v.totais.bruto;
    descontos += v.totais.desconto;
    freteCobrado += v.freteCobrado || 0;
    receitaBruta += v.totais.liquido;
    taxasCartao += v.totais.taxas;
    comissoes += v.totais.comissaoCanal;
    cmv += v.totais.cmv;
    itens += v.itens.reduce((s, i) => s + i.qtd, 0);

    const c = porCanal[v.canal] || (porCanal[v.canal] = {
      canal: v.canal, nome: v.canalNome, receita: 0, cmv: 0, taxas: 0, comissao: 0, vendas: 0,
    });
    c.receita += v.totais.liquido; c.cmv += v.totais.cmv;
    c.taxas += v.totais.taxas; c.comissao += v.totais.comissaoCanal; c.vendas++;
  }

  let devolucoes = 0, cmvDevolvido = 0;
  for (const v of Object.values(estado.vendas)) {
    for (const dev of v.devolucoes || []) {
      if (!dentro(dev.data)) continue;
      devolucoes += dev.valor;
      cmvDevolvido += dev.custo;
    }
  }

  // Imposto: usa o DAS efetivamente lancado no mes; se nao houver lancamento,
  // usa o valor configurado em Ajustes. Se ninguem configurou, fica zero e a
  // tela avisa — melhor um numero faltando e sinalizado do que um numero chutado.
  const lancamentoImposto = Object.values(estado.impostos).find((i) => i.competencia === comp);
  const meiAtivo = estado.config.mei && estado.config.mei.ativo;
  const imposto = lancamentoImposto ? lancamentoImposto.valor
    : (meiAtivo ? (estado.config.mei.dasMensal || 0) : 0);
  const impostoEstimado = !lancamentoImposto;

  const receitaLiquida = receitaBruta - devolucoes - taxasCartao - comissoes - imposto;
  const cmvLiquido = cmv - cmvDevolvido;
  const lucroBruto = receitaLiquida - cmvLiquido;

  // Despesas do mes, separadas por natureza.
  let fixas = 0, variaveis = 0;
  const porCategoria = {};
  for (const d of Object.values(estado.despesas)) {
    if (d.competencia !== comp) continue;
    if (d.tipo === 'fixa') fixas += d.valor; else variaveis += d.valor;
    const k = d.categoria || 'Outras';
    porCategoria[k] = (porCategoria[k] || 0) + d.valor;
  }
  const despesas = fixas + variaveis;
  const resultado = lucroBruto - despesas;

  const pct = (n) => (receitaBruta > 0 ? (n / receitaBruta) * 100 : null);

  // Ponto de equilibrio: quanto precisa faturar no mes para o resultado zerar.
  // Margem de contribuicao = o que sobra de cada real vendido depois de tudo
  // que varia junto com a venda (CMV, taxas, comissoes, despesas variaveis).
  const contribuicao = receitaBruta - devolucoes - taxasCartao - comissoes - cmvLiquido - variaveis;
  const mcPct = receitaBruta > 0 ? contribuicao / receitaBruta : 0;
  const pontoEquilibrio = mcPct > 0 ? Math.round((fixas + imposto) / mcPct) : null;

  return {
    competencia: comp,
    nVendas, itens,
    ticketMedio: nVendas ? Math.round(receitaBruta / nVendas) : 0,
    vendasBruto, descontos, freteCobrado, receitaBruta,
    devolucoes, taxasCartao, comissoes, imposto, impostoEstimado,
    receitaLiquida, cmv: cmvLiquido, lucroBruto,
    fixas, variaveis, despesas, porCategoria, resultado,
    margemBruta: pct(lucroBruto), margemLiquida: pct(resultado),
    margemContribuicao: mcPct * 100, pontoEquilibrio,
    porCanal: Object.values(porCanal),
    pct,
  };
}

/** Serie de DREs para o grafico e o comparativo de 12 meses. */
export function serieDRE(estado, competencias) {
  return competencias.map((c) => calcularDRE(estado, c));
}

/**
 * Faturamento acumulado nos ultimos 12 meses — o numero que decide se o MEI
 * estourou o teto. Conta receita bruta menos devolucoes, que e' o que o
 * faturamento declarado considera.
 */
export function faturamento12Meses(estado, competencias) {
  let total = 0;
  const set = new Set(competencias);
  for (const v of Object.values(estado.vendas)) {
    if (v.status === 'cancelada') continue;
    if (set.has(v.data.slice(0, 7))) total += v.totais.liquido;
  }
  for (const v of Object.values(estado.vendas)) {
    for (const dev of v.devolucoes || []) {
      if (set.has(dev.data.slice(0, 7))) total -= dev.valor;
    }
  }
  return total;
}
