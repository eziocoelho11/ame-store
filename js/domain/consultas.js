// consultas.js — leituras derivadas do estado. Nenhuma escreve nada.

import { normaliza, limitesDaCompetencia, iso, somaDias } from '../core/fmt.js';
import { nomeVariante, precoDaVariante } from '../core/state.js';

// ---------------- catalogo e estoque ----------------

/** Lista plana de variantes com dados do produto juntos — a base do PDV e do estoque. */
export function listarVariantes(estado, { incluirInativas = false, comEstoque = null } = {}) {
  const saida = [];
  for (const v of Object.values(estado.variantes)) {
    const p = estado.produtos[v.produtoId];
    if (!p) continue;
    if (!incluirInativas && (!v.ativo || !p.ativo)) continue;
    if (comEstoque === true && v.saldo <= 0) continue;
    if (comEstoque === false && v.saldo > 0) continue;
    saida.push({
      ...v,
      produto: p.nome, categoria: p.categoria, marca: p.marca,
      estoqueMinimo: p.estoqueMinimo,
      preco: precoDaVariante(estado, v.id),
      rotulo: nomeVariante(estado, v.id),
      busca: normaliza([p.nome, p.categoria, p.marca, v.tamanho, v.cor, v.sku, v.codigoBarras].join(' ')),
    });
  }
  return saida.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** Busca por nome, SKU ou codigo de barras. Codigo de barras exato ganha prioridade. */
export function buscarVariantes(estado, termo, opcoes = {}) {
  const lista = listarVariantes(estado, opcoes);
  const t = normaliza(termo).trim();
  if (!t) return lista;
  const exato = lista.filter((v) => v.codigoBarras === termo.trim() || normaliza(v.sku) === t);
  const palavras = t.split(/\s+/);
  const resto = lista.filter((v) => !exato.includes(v) && palavras.every((p) => v.busca.includes(p)));
  return exato.concat(resto);
}

export function porCodigoDeBarras(estado, codigo) {
  const c = String(codigo || '').trim();
  if (!c) return null;
  return Object.values(estado.variantes).find((v) => v.codigoBarras === c) || null;
}

/** Itens no ou abaixo do minimo — o alerta de reposicao. */
export function estoqueBaixo(estado) {
  return listarVariantes(estado)
    .filter((v) => v.saldo <= (v.estoqueMinimo === undefined ? 2 : v.estoqueMinimo))
    .sort((a, b) => a.saldo - b.saldo);
}

/** Valor total do estoque a custo — quanto dinheiro esta' parado na arara. */
export function valorEstoque(estado) {
  let unidades = 0, custo = 0, venda = 0;
  for (const v of Object.values(estado.variantes)) {
    if (v.saldo <= 0) continue;
    unidades += v.saldo;
    custo += v.saldo * v.custoMedio;
    venda += v.saldo * precoDaVariante(estado, v.id);
  }
  return { unidades, custo, venda, margemPotencial: venda - custo };
}

// ---------------- vendas ----------------

export function vendasNoPeriodo(estado, de, ate, { canal = '', clienteId = '', incluirCanceladas = false } = {}) {
  return Object.values(estado.vendas)
    .filter((v) => v.data >= de && v.data <= ate)
    .filter((v) => incluirCanceladas || v.status !== 'cancelada')
    .filter((v) => !canal || v.canal === canal)
    .filter((v) => !clienteId || v.clienteId === clienteId)
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
}

export function vendasDoMes(estado, comp, filtros) {
  const { inicio, fim } = limitesDaCompetencia(comp);
  return vendasNoPeriodo(estado, inicio, fim, filtros);
}

/** Resumo rapido de um periodo, para os cartoes do topo. */
export function resumoVendas(vendas) {
  let receita = 0, cmv = 0, taxas = 0, itens = 0, desconto = 0;
  for (const v of vendas) {
    receita += v.totais.liquido - v.totais.devolvido;
    cmv += v.totais.cmv - v.totais.cmvDevolvido;
    taxas += v.totais.taxas + v.totais.comissaoCanal;
    desconto += v.totais.desconto;
    itens += v.itens.reduce((s, i) => s + i.qtd, 0);
  }
  const n = vendas.length;
  return {
    n, receita, cmv, taxas, itens, desconto,
    lucroBruto: receita - cmv - taxas,
    ticket: n ? Math.round(receita / n) : 0,
    margem: receita > 0 ? ((receita - cmv - taxas) / receita) * 100 : null,
  };
}

// ---------------- recebiveis e caixa ----------------

export function recebiveis(estado, { status = '', de = '', ate = '', tipo = '', clienteId = '' } = {}) {
  return Object.values(estado.recebiveis)
    .filter((r) => r.status !== 'cancelado')
    .filter((r) => !status || r.status === status)
    .filter((r) => !tipo || r.tipo === tipo)
    .filter((r) => !clienteId || r.clienteId === clienteId)
    .filter((r) => !de || r.vencimento >= de)
    .filter((r) => !ate || r.vencimento <= ate)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** O que ainda tem para entrar: cartao a receber + fiado em aberto. */
export function aReceber(estado, hoje = iso()) {
  const abertos = recebiveis(estado, { status: 'aberto' });
  const total = abertos.reduce((s, r) => s + r.liquido, 0);
  const vencidos = abertos.filter((r) => r.vencimento < hoje);
  const proximos30 = abertos.filter((r) => r.vencimento >= hoje && r.vencimento <= somaDias(hoje, 30));
  return {
    lista: abertos, total,
    vencidos: vencidos.reduce((s, r) => s + r.liquido, 0), nVencidos: vencidos.length,
    proximos30: proximos30.reduce((s, r) => s + r.liquido, 0),
    cartao: abertos.filter((r) => r.tipo === 'credito' || r.tipo === 'debito').reduce((s, r) => s + r.liquido, 0),
    fiado: abertos.filter((r) => r.tipo === 'fiado').reduce((s, r) => s + r.liquido, 0),
  };
}

/**
 * O que ainda esta' em aberto, somado por mes de vencimento. E' a previsao de
 * caixa: com fiado parcelado e cartao a prazo, o dinheiro de uma venda de hoje
 * se espalha por varios meses, e essa e' a unica tela que mostra isso antes de
 * acontecer. Vencido entra na primeira coluna, porque e' dinheiro que ja'
 * deveria ter entrado.
 */
export function aReceberPorMes(estado, { hoje = iso(), meses = 6 } = {}) {
  const abertos = recebiveis(estado, { status: 'aberto' });
  const compAtual = hoje.slice(0, 7);
  const linhas = new Map();
  const linha = (comp) => {
    if (!linhas.has(comp)) linhas.set(comp, { comp, cartao: 0, fiado: 0, vencido: 0, total: 0, n: 0 });
    return linhas.get(comp);
  };
  for (const r of abertos) {
    // Parcela vencida nao fica escondida num mes passado: aparece no mes atual.
    const comp = r.vencimento < hoje ? compAtual : r.vencimento.slice(0, 7);
    const l = linha(comp);
    if (r.tipo === 'fiado') l.fiado += r.liquido; else l.cartao += r.liquido;
    if (r.vencimento < hoje) l.vencido += r.liquido;
    l.total += r.liquido;
    l.n++;
  }
  const lista = [...linhas.values()].sort((a, b) => a.comp.localeCompare(b.comp));
  return meses > 0 ? lista.slice(0, meses) : lista;
}

/**
 * Fluxo de caixa em REGIME DE CAIXA: entra quando o dinheiro cai, sai quando a
 * despesa e' paga. E' de proposito diferente da DRE.
 */
export function fluxoCaixa(estado, de, ate) {
  const dias = {};
  const toca = (data) => (dias[data] || (dias[data] = { data, entradas: 0, saidas: 0, itens: [] }));

  for (const r of Object.values(estado.recebiveis)) {
    if (r.status !== 'recebido' || !r.recebidoEm) continue;
    if (r.recebidoEm < de || r.recebidoEm > ate) continue;
    const d = toca(r.recebidoEm);
    d.entradas += r.liquido;
    d.itens.push({ tipo: 'entrada', desc: rotuloRecebivel(r), valor: r.liquido });
  }
  for (const dp of Object.values(estado.despesas)) {
    if (!dp.pago) continue;
    const data = dp.dataPagto || dp.data;
    if (data < de || data > ate) continue;
    const d = toca(data);
    d.saidas += dp.valor;
    d.itens.push({ tipo: 'saida', desc: dp.categoria + (dp.descricao ? ' — ' + dp.descricao : ''), valor: dp.valor });
  }
  for (const im of Object.values(estado.impostos)) {
    if (!im.pago || !im.data) continue;
    if (im.data < de || im.data > ate) continue;
    const d = toca(im.data);
    d.saidas += im.valor;
    d.itens.push({ tipo: 'saida', desc: im.tipo + ' ' + im.competencia, valor: im.valor });
  }
  // Compras de mercadoria saem do caixa no dia da entrada.
  for (const m of estado.movimentos) {
    if (m.tipo !== 'entrada' || m.data < de || m.data > ate) continue;
    const d = toca(m.data);
    const valor = m.qtd * m.custoUnit;
    d.saidas += valor;
    d.itens.push({ tipo: 'saida', desc: 'Compra de mercadoria', valor });
  }

  const lista = Object.values(dias).sort((a, b) => a.data.localeCompare(b.data));
  let acumulado = 0;
  for (const d of lista) { d.saldo = d.entradas - d.saidas; acumulado += d.saldo; d.acumulado = acumulado; }
  return {
    dias: lista,
    entradas: lista.reduce((s, d) => s + d.entradas, 0),
    saidas: lista.reduce((s, d) => s + d.saidas, 0),
    saldo: acumulado,
  };
}

export function rotuloRecebivel(r) {
  const nomes = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado' };
  const base = nomes[r.tipo] || r.tipo;
  const parc = r.totalParcelas > 1 ? ` ${r.parcela}/${r.totalParcelas}` : '';
  return `${base}${parc} — venda #${r.numeroVenda}`;
}

// ---------------- relatorios ----------------

/** Desempenho por variante no periodo: quanto vendeu, quanto sobrou de margem. */
export function desempenhoPorItem(estado, de, ate) {
  const mapa = {};
  for (const v of vendasNoPeriodo(estado, de, ate)) {
    for (const it of v.itens) {
      const k = it.varianteId;
      const linha = mapa[k] || (mapa[k] = {
        varianteId: k, rotulo: nomeVariante(estado, k), qtd: 0, receita: 0, custo: 0,
        categoria: (estado.produtos[(estado.variantes[k] || {}).produtoId] || {}).categoria || '—',
      });
      linha.qtd += it.qtd;
      linha.receita += it.bruto - it.desconto;
      linha.custo += it.custo;
    }
  }
  // Devolucao tira do desempenho do item, senao o campeao de vendas pode ser
  // justamente a peca que todo mundo devolve.
  for (const v of Object.values(estado.vendas)) {
    for (const dev of v.devolucoes || []) {
      if (dev.data < de || dev.data > ate) continue;
      for (const it of dev.itens) {
        const linha = mapa[it.varianteId];
        if (!linha) continue;
        linha.qtd -= it.qtd;
        linha.receita -= it.valor;
        linha.custo -= it.custo;
      }
    }
  }
  return Object.values(mapa)
    .map((l) => ({ ...l, margem: l.receita - l.custo, margemPct: l.receita > 0 ? ((l.receita - l.custo) / l.receita) * 100 : null }))
    .sort((a, b) => b.receita - a.receita);
}

/**
 * Curva ABC por receita: A = os itens que somam os primeiros 80% do faturamento.
 * Serve para decidir o que repor com prioridade e o que parar de comprar.
 */
export function curvaABC(estado, de, ate) {
  const itens = desempenhoPorItem(estado, de, ate).filter((i) => i.receita > 0);
  const total = itens.reduce((s, i) => s + i.receita, 0);
  let acumulado = 0;
  return itens.map((i) => {
    acumulado += i.receita;
    const pctAcum = total > 0 ? (acumulado / total) * 100 : 0;
    return { ...i, pctReceita: total > 0 ? (i.receita / total) * 100 : 0, pctAcum, classe: pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C' };
  });
}

/**
 * Giro e cobertura de estoque. Cobertura em dias responde a pergunta pratica:
 * "no ritmo atual, em quantos dias essa peca acaba?"
 */
export function giroEstoque(estado, de, ate) {
  const diasPeriodo = Math.max(1, Math.round((new Date(ate) - new Date(de)) / 86400000) + 1);
  const vendido = {};
  for (const v of vendasNoPeriodo(estado, de, ate)) {
    for (const it of v.itens) vendido[it.varianteId] = (vendido[it.varianteId] || 0) + it.qtd;
  }
  return listarVariantes(estado).map((v) => {
    const qtd = vendido[v.id] || 0;
    const porDia = qtd / diasPeriodo;
    return {
      ...v, vendido: qtd,
      giro: v.saldo > 0 ? qtd / v.saldo : (qtd > 0 ? Infinity : 0),
      coberturaDias: porDia > 0 ? Math.round(v.saldo / porDia) : (v.saldo > 0 ? null : 0),
    };
  }).sort((a, b) => b.vendido - a.vendido);
}

/** Vendas por dia da semana e por hora — quando a loja realmente vende. */
export function padraoDeVenda(estado, de, ate) {
  const semana = Array.from({ length: 7 }, () => ({ n: 0, receita: 0 }));
  const horas = Array.from({ length: 24 }, () => ({ n: 0, receita: 0 }));
  for (const v of vendasNoPeriodo(estado, de, ate)) {
    const [a, m, d] = v.data.split('-').map(Number);
    const dia = new Date(a, m - 1, d).getDay();
    semana[dia].n++; semana[dia].receita += v.totais.liquido;
    const h = v.hora ? parseInt(String(v.hora).slice(0, 2), 10) : new Date(v.ts).getHours();
    if (h >= 0 && h < 24) { horas[h].n++; horas[h].receita += v.totais.liquido; }
  }
  return { semana, horas };
}

/** Agrupa a receita por categoria de produto. */
export function receitaPorCategoria(estado, de, ate) {
  const mapa = {};
  for (const i of desempenhoPorItem(estado, de, ate)) {
    const k = i.categoria || '—';
    const l = mapa[k] || (mapa[k] = { categoria: k, receita: 0, custo: 0, qtd: 0 });
    l.receita += i.receita; l.custo += i.custo; l.qtd += i.qtd;
  }
  return Object.values(mapa)
    .map((l) => ({ ...l, margem: l.receita - l.custo }))
    .sort((a, b) => b.receita - a.receita);
}

/** Serie diaria de receita, para o grafico do dashboard. */
export function receitaPorDia(estado, de, ate) {
  const mapa = {};
  for (let d = de; d <= ate; d = somaDias(d, 1)) mapa[d] = 0;
  for (const v of vendasNoPeriodo(estado, de, ate)) {
    mapa[v.data] = (mapa[v.data] || 0) + v.totais.liquido;
  }
  return Object.entries(mapa).map(([data, valor]) => ({ data, valor }));
}
