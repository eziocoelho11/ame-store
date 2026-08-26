// state.js — o coracao do sistema.
//
// O estado NUNCA e' editado direto: ele e' o resultado de aplicar, em ordem,
// todos os eventos do log. Isso da tres coisas de graca:
//   1. auditoria — da' para saber quem lancou o que, quando e de qual aparelho
//   2. sincronia sem conflito — juntar dois logs e' so' unir e reordenar
//   3. correcao sem destruicao — estorno e' um evento novo, nao um DELETE
//
// Custo de mercadoria: CUSTO MEDIO PONDERADO, recalculado na hora do replay.
// Nao confiamos no custo que a tela mandou: se uma entrada de compra chegar
// atrasada de outro aparelho, o replay corrige o CMV das vendas seguintes
// sozinho. E' o que realmente aconteceu no estoque.

import { aplicaPct, dividirCentavos, somaDias, somaMesesData, competencia } from './fmt.js';

export const CONFIG_PADRAO = {
  loja: { nome: 'AME Store', cnpj: '', telefone: '', endereco: '' },
  // Valores tributarios NAO vem preenchidos de proposito: mudam por lei todo ano.
  // O app avisa na tela inicial enquanto `confirmado` for false.
  mei: { ativo: true, dasMensal: 0, tetoAnual: 8100000, dataReferencia: '', confirmado: false },
  canais: [
    { id: 'loja', nome: 'Loja física', comissaoPct: 0 },
    { id: 'instagram', nome: 'Instagram / WhatsApp', comissaoPct: 0 },
    { id: 'marketplace', nome: 'Marketplace', comissaoPct: 0 },
  ],
  // Taxas comecam em zero: cada maquininha cobra o seu. Preencher em Ajustes.
  taxas: [
    { id: 't-deb', forma: 'debito', parcelasDe: 1, parcelasAte: 1, taxaPct: 0, prazoDias: 1 },
    { id: 't-cred1', forma: 'credito', parcelasDe: 1, parcelasAte: 1, taxaPct: 0, prazoDias: 30 },
    { id: 't-cred2', forma: 'credito', parcelasDe: 2, parcelasAte: 6, taxaPct: 0, prazoDias: 30 },
    { id: 't-cred7', forma: 'credito', parcelasDe: 7, parcelasAte: 12, taxaPct: 0, prazoDias: 30 },
  ],
  categoriasProduto: ['Vestidos', 'Blusas', 'Calças', 'Saias', 'Shorts', 'Conjuntos',
    'Casacos e jaquetas', 'Macacões', 'Lingerie', 'Moda praia', 'Acessórios', 'Calçados', 'Bolsas'],
  categoriasDespesa: [
    { nome: 'Aluguel', tipo: 'fixa' },
    { nome: 'Energia', tipo: 'fixa' },
    { nome: 'Água', tipo: 'fixa' },
    { nome: 'Internet e telefone', tipo: 'fixa' },
    { nome: 'Salários e encargos', tipo: 'fixa' },
    { nome: 'Pró-labore', tipo: 'fixa' },
    { nome: 'Contabilidade', tipo: 'fixa' },
    { nome: 'Marketing e anúncios', tipo: 'variavel' },
    { nome: 'Embalagens e sacolas', tipo: 'variavel' },
    { nome: 'Frete sobre vendas', tipo: 'variavel' },
    { nome: 'Manutenção e reformas', tipo: 'variavel' },
    { nome: 'Taxas bancárias', tipo: 'variavel' },
    { nome: 'Material de loja', tipo: 'variavel' },
    { nome: 'Outras', tipo: 'variavel' },
  ],
  tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único', '34', '36', '38', '40', '42', '44', '46'],
  estoqueMinimoPadrao: 2,
};

export function estadoInicial() {
  return {
    config: estruturaClonada(CONFIG_PADRAO),
    produtos: {},
    variantes: {},
    clientes: {},
    fornecedores: {},
    vendas: {},
    despesas: {},
    recebiveis: {},
    impostos: {},
    movimentos: [],
    contadores: { venda: 0 },
    totalEventos: 0,
  };
}

function estruturaClonada(o) {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Aplica uma lista de eventos sobre um estado, em ordem de id.
 * Ignora id repetido: na sincronia o mesmo evento pode chegar por dois
 * caminhos, e aplicar duas vezes dobraria estoque e faturamento.
 */
export function reduzir(estado, eventos) {
  const vistos = new Set();
  const ordenados = [...eventos]
    .filter((ev) => {
      if (!ev || !ev.id || vistos.has(ev.id)) return false;
      vistos.add(ev.id);
      return true;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const ev of ordenados) aplicar(estado, ev);
  return estado;
}

/** Constroi o estado do zero a partir do log completo. */
export function construir(eventos) {
  return reduzir(estadoInicial(), eventos);
}

// =====================================================================
// Aplicacao de um evento
// =====================================================================

export function aplicar(e, ev) {
  const d = ev.dados || {};
  switch (ev.tipo) {
    case 'config.definida': definirConfig(e, d.caminho, d.valor); break;

    // ---------- catalogo ----------
    case 'produto.criado':
      e.produtos[d.id] = {
        id: d.id, nome: d.nome, categoria: d.categoria || '', marca: d.marca || '',
        descricao: d.descricao || '', precoVenda: d.precoVenda || 0,
        estoqueMinimo: d.estoqueMinimo === undefined ? e.config.estoqueMinimoPadrao : d.estoqueMinimo,
        ativo: true, criadoEm: ev.ts, variantes: [],
      };
      break;
    case 'produto.editado':
      if (e.produtos[d.id]) Object.assign(e.produtos[d.id], d.campos);
      break;
    case 'produto.arquivado':
      if (e.produtos[d.id]) e.produtos[d.id].ativo = false;
      break;
    case 'produto.reativado':
      if (e.produtos[d.id]) e.produtos[d.id].ativo = true;
      break;

    case 'variante.criada': {
      const p = e.produtos[d.produtoId];
      e.variantes[d.id] = {
        id: d.id, produtoId: d.produtoId, tamanho: d.tamanho || 'Único', cor: d.cor || '',
        sku: d.sku || '', codigoBarras: d.codigoBarras || '',
        precoVenda: d.precoVenda === undefined ? null : d.precoVenda, ativo: true,
        saldo: 0, custoMedio: 0, ultimoCusto: 0, vendidoTotal: 0,
      };
      if (p && !p.variantes.includes(d.id)) p.variantes.push(d.id);
      break;
    }
    case 'variante.editada':
      if (e.variantes[d.id]) Object.assign(e.variantes[d.id], d.campos);
      break;
    case 'variante.arquivada':
      if (e.variantes[d.id]) e.variantes[d.id].ativo = false;
      break;

    // ---------- estoque ----------
    case 'estoque.entrada': entradaEstoque(e, ev, d); break;
    case 'estoque.ajuste': ajusteEstoque(e, ev, d); break;

    // ---------- vendas ----------
    case 'venda.registrada': registrarVenda(e, ev, d); break;
    case 'venda.cancelada': cancelarVenda(e, ev, d); break;
    case 'venda.devolvida': devolverVenda(e, ev, d); break;

    // ---------- despesas ----------
    case 'despesa.lancada':
      e.despesas[d.id] = {
        id: d.id, data: d.data, competencia: d.competencia || competencia(d.data),
        categoria: d.categoria || 'Outras', tipo: d.tipo || 'variavel',
        descricao: d.descricao || '', valor: d.valor || 0,
        fornecedor: d.fornecedor || '', formaPagto: d.formaPagto || 'pix',
        pago: d.pago !== false, dataPagto: d.dataPagto || d.data,
        recorrente: !!d.recorrente, obs: d.obs || '', criadoEm: ev.ts,
      };
      break;
    case 'despesa.editada':
      if (e.despesas[d.id]) {
        Object.assign(e.despesas[d.id], d.campos);
        if (d.campos && d.campos.data) e.despesas[d.id].competencia = competencia(d.campos.data);
      }
      break;
    case 'despesa.excluida':
      delete e.despesas[d.id];
      break;

    // ---------- pessoas ----------
    case 'cliente.criado':
      e.clientes[d.id] = {
        id: d.id, nome: d.nome, telefone: d.telefone || '', email: d.email || '',
        aniversario: d.aniversario || '', obs: d.obs || '', ativo: true, criadoEm: ev.ts,
      };
      break;
    case 'cliente.editado':
      if (e.clientes[d.id]) Object.assign(e.clientes[d.id], d.campos);
      break;
    case 'cliente.arquivado':
      if (e.clientes[d.id]) e.clientes[d.id].ativo = false;
      break;
    case 'fornecedor.criado':
      e.fornecedores[d.id] = { id: d.id, nome: d.nome, contato: d.contato || '', obs: d.obs || '' };
      break;
    case 'fornecedor.editado':
      if (e.fornecedores[d.id]) Object.assign(e.fornecedores[d.id], d.campos);
      break;

    // ---------- financeiro ----------
    case 'recebivel.baixado': {
      const r = e.recebiveis[d.recebivelId];
      if (r && r.status !== 'cancelado') {
        r.status = 'recebido';
        r.recebidoEm = d.data;
        r.formaRecebimento = d.forma || r.tipo;
      }
      break;
    }
    /**
     * Saldo a receber que nasceu FORA do app — a planilha de fiado que a loja
     * usava antes. Nao e' venda: a venda aconteceu meses atras e o que sobrou e'
     * a divida. Por isso este evento cria o recebivel direto, sem mexer em
     * estoque e sem lancar receita na DRE. Lancar como venda nova inventaria
     * faturamento no mes do vencimento e falsearia o teto do MEI.
     */
    case 'recebivel.importado': {
      const valor = d.valor || 0;
      e.recebiveis[d.id] = {
        id: d.id, vendaId: null, numeroVenda: null, clienteId: d.clienteId || null,
        tipo: d.tipo || 'fiado', bandeira: '', parcela: 1, totalParcelas: 1,
        bruto: valor, taxaPct: 0, taxa: 0, liquido: valor,
        vencimento: d.vencimento, data: d.data || d.vencimento,
        status: 'aberto', recebidoEm: null, formaRecebimento: null,
        origem: d.origem || 'importado', descricao: d.descricao || '',
      };
      break;
    }
    case 'recebivel.estornado': {
      const r = e.recebiveis[d.recebivelId];
      if (r) { r.status = 'aberto'; r.recebidoEm = null; }
      break;
    }
    case 'imposto.lancado':
      e.impostos[d.id] = {
        id: d.id, competencia: d.competencia, tipo: d.tipo || 'DAS-MEI',
        valor: d.valor || 0, data: d.data, pago: d.pago !== false,
      };
      break;

    default:
      // Evento desconhecido (versao mais nova em outro aparelho): guarda e ignora.
      break;
  }
  e.totalEventos++;
  return e;
}

function definirConfig(e, caminho, valor) {
  const partes = String(caminho).split('.');
  let alvo = e.config;
  for (let i = 0; i < partes.length - 1; i++) {
    if (typeof alvo[partes[i]] !== 'object' || alvo[partes[i]] === null) alvo[partes[i]] = {};
    alvo = alvo[partes[i]];
  }
  alvo[partes[partes.length - 1]] = valor;
}

// =====================================================================
// Estoque
// =====================================================================

function entradaEstoque(e, ev, d) {
  const itens = d.itens || [];
  // Rateio do frete proporcional ao valor de cada item: frete de compra e' custo
  // da mercadoria, nao despesa. Sem ratear, a margem do produto sai inflada.
  const valorTotal = itens.reduce((s, it) => s + it.custoUnit * it.qtd, 0);
  const frete = d.freteTotal || 0;

  for (const it of itens) {
    const v = e.variantes[it.varianteId];
    if (!v) continue;
    const valorItem = it.custoUnit * it.qtd;
    const freteItem = (frete > 0 && valorTotal > 0) ? Math.round(frete * (valorItem / valorTotal)) : 0;
    const custoTotalItem = valorItem + freteItem;
    const custoUnitReal = it.qtd > 0 ? Math.round(custoTotalItem / it.qtd) : 0;

    const saldoAnterior = Math.max(0, v.saldo);
    v.custoMedio = (saldoAnterior + it.qtd) > 0
      ? Math.round((saldoAnterior * v.custoMedio + custoTotalItem) / (saldoAnterior + it.qtd))
      : custoUnitReal;
    v.ultimoCusto = custoUnitReal;
    v.saldo = v.saldo + it.qtd;

    e.movimentos.push({
      id: d.id + '-' + it.varianteId, ts: ev.ts, data: d.data, varianteId: it.varianteId,
      tipo: 'entrada', qtd: it.qtd, custoUnit: custoUnitReal, saldoDepois: v.saldo,
      ref: d.id, refTipo: 'compra', obs: d.documento || '',
    });
  }
}

function ajusteEstoque(e, ev, d) {
  const v = e.variantes[d.varianteId];
  if (!v) return;
  const delta = (d.qtdNova !== undefined && d.qtdNova !== null)
    ? d.qtdNova - v.saldo
    : (d.delta || 0);
  if (delta === 0) return;
  v.saldo += delta;
  e.movimentos.push({
    id: d.id, ts: ev.ts, data: d.data, varianteId: d.varianteId,
    tipo: delta > 0 ? 'ajuste+' : 'ajuste-', qtd: delta,
    custoUnit: v.custoMedio, saldoDepois: v.saldo, ref: d.id, refTipo: 'ajuste',
    obs: d.motivo || '',
  });
}

/** Encontra a regra de taxa da maquininha para a forma e o numero de parcelas. */
export function taxaPara(config, forma, parcelas) {
  const lista = config.taxas || [];
  const achou = lista.find((t) => t.forma === forma && parcelas >= t.parcelasDe && parcelas <= t.parcelasAte);
  if (achou) return achou;
  if (forma === 'debito') return { taxaPct: 0, prazoDias: 1 };
  if (forma === 'credito') return { taxaPct: 0, prazoDias: 30 };
  return { taxaPct: 0, prazoDias: 0 };
}

// =====================================================================
// Vendas
// =====================================================================

function registrarVenda(e, ev, d) {
  e.contadores.venda = Math.max(e.contadores.venda, d.numero || 0);

  const canal = (e.config.canais || []).find((c) => c.id === d.canal)
    || { id: d.canal, nome: d.canal || 'Loja física', comissaoPct: 0 };

  const itens = (d.itens || []).map((it) => {
    const v = e.variantes[it.varianteId];
    // CMV pelo custo medio vigente NESTE ponto do replay — nao pelo que a tela mandou.
    const custoUnit = v ? v.custoMedio : (it.custoUnit || 0);
    return {
      varianteId: it.varianteId, qtd: it.qtd, precoUnit: it.precoUnit,
      descontoUnit: it.descontoUnit || 0, custoUnit,
      bruto: it.precoUnit * it.qtd,
      desconto: (it.descontoUnit || 0) * it.qtd,
      custo: custoUnit * it.qtd,
    };
  });

  const bruto = itens.reduce((s, i) => s + i.bruto, 0);
  const descontoItens = itens.reduce((s, i) => s + i.desconto, 0);
  const descontoGeral = d.descontoGeral || 0;
  const desconto = descontoItens + descontoGeral;
  const freteCobrado = d.freteCobrado || 0;
  const liquido = bruto - desconto + freteCobrado;
  const cmv = itens.reduce((s, i) => s + i.custo, 0);
  const comissaoCanal = aplicaPct(bruto - desconto, canal.comissaoPct || 0);

  const venda = {
    id: d.id, numero: d.numero, data: d.data, hora: d.hora || null, ts: ev.ts,
    canal: d.canal, canalNome: canal.nome, clienteId: d.clienteId || null,
    itens, descontoGeral, freteCobrado, obs: d.obs || '',
    pagamentos: d.pagamentos || [],
    status: 'ativa', devolucoes: [],
    totais: { bruto, desconto, liquido, cmv, comissaoCanal, taxas: 0, devolvido: 0, cmvDevolvido: 0 },
    deviceId: ev.deviceId,
  };
  e.vendas[d.id] = venda;

  for (const it of itens) {
    const v = e.variantes[it.varianteId];
    if (!v) continue;
    v.saldo -= it.qtd;
    v.vendidoTotal += it.qtd;
    e.movimentos.push({
      id: d.id + '-' + it.varianteId, ts: ev.ts, data: d.data, varianteId: it.varianteId,
      tipo: 'venda', qtd: -it.qtd, custoUnit: it.custoUnit, saldoDepois: v.saldo,
      ref: d.id, refTipo: 'venda', obs: 'Venda #' + d.numero,
    });
  }

  // Recebiveis: e' aqui que a diferenca entre LUCRO e CAIXA nasce.
  let taxasTotais = 0;
  (d.pagamentos || []).forEach((pg, idxPg) => {
    const forma = pg.forma;
    // Credito e fiado parcelam; dinheiro, PIX e debito entram de uma vez so'.
    const nParcelas = (forma === 'credito' || forma === 'fiado') ? Math.max(1, pg.parcelas || 1) : 1;
    const regra = taxaPara(e.config, forma, nParcelas);
    const taxaPct = (pg.taxaPct === undefined || pg.taxaPct === null) ? regra.taxaPct : pg.taxaPct;
    const prazoDias = (pg.prazoDias === undefined || pg.prazoDias === null) ? regra.prazoDias : pg.prazoDias;
    const valores = dividirCentavos(pg.valor, nParcelas);

    valores.forEach((valorParcela, i) => {
      const taxa = aplicaPct(valorParcela, taxaPct);
      taxasTotais += taxa;
      const imediato = (forma === 'dinheiro' || forma === 'pix');
      // Fiado: a 1a parcela vence na data combinada e as seguintes caem de mes
      // em mes, no mesmo dia. Cartao segue o prazo de repasse da maquininha.
      const vencimento = forma === 'fiado'
        ? somaMesesData(pg.vencimento || d.data, i)
        : imediato ? d.data : somaDias(d.data, (prazoDias || 30) * (i + 1));
      const rid = d.id + '#' + idxPg + '#' + (i + 1);
      e.recebiveis[rid] = {
        id: rid, vendaId: d.id, numeroVenda: d.numero, clienteId: d.clienteId || null,
        tipo: forma, bandeira: pg.bandeira || '', parcela: i + 1, totalParcelas: nParcelas,
        bruto: valorParcela, taxaPct, taxa, liquido: valorParcela - taxa,
        vencimento, data: d.data,
        status: imediato ? 'recebido' : 'aberto',
        recebidoEm: imediato ? d.data : null,
        formaRecebimento: imediato ? forma : null,
      };
    });
  });
  venda.totais.taxas = taxasTotais;
}

function cancelarVenda(e, ev, d) {
  const venda = e.vendas[d.vendaId];
  if (!venda || venda.status === 'cancelada') return;
  venda.status = 'cancelada';
  venda.canceladaEm = d.data;
  venda.motivoCancelamento = d.motivo || '';

  for (const it of venda.itens) {
    const v = e.variantes[it.varianteId];
    if (!v) continue;
    v.saldo += it.qtd;
    v.vendidoTotal -= it.qtd;
    e.movimentos.push({
      id: 'canc-' + venda.id + '-' + it.varianteId, ts: ev.ts, data: d.data,
      varianteId: it.varianteId, tipo: 'cancelamento', qtd: it.qtd,
      custoUnit: it.custoUnit, saldoDepois: v.saldo, ref: venda.id, refTipo: 'cancelamento',
      obs: 'Cancelamento da venda #' + venda.numero,
    });
  }
  for (const r of Object.values(e.recebiveis)) {
    if (r.vendaId === venda.id) r.status = 'cancelado';
  }
}

function devolverVenda(e, ev, d) {
  const venda = e.vendas[d.vendaId];
  if (!venda) return;
  const itens = (d.itens || []).map((it) => {
    const orig = venda.itens.find((x) => x.varianteId === it.varianteId);
    const precoUnit = orig ? (orig.precoUnit - orig.descontoUnit) : (it.valorUnit || 0);
    const custoUnit = orig ? orig.custoUnit : 0;
    return { varianteId: it.varianteId, qtd: it.qtd, valor: precoUnit * it.qtd, custo: custoUnit * it.qtd, custoUnit };
  });
  const valor = itens.reduce((s, i) => s + i.valor, 0);
  const custo = itens.reduce((s, i) => s + i.custo, 0);

  venda.devolucoes.push({
    id: d.id, data: d.data, motivo: d.motivo || '', valor, custo, itens,
    retornaEstoque: d.retornaEstoque !== false, formaDevolucao: d.formaDevolucao || 'dinheiro',
  });
  venda.totais.devolvido += valor;
  venda.totais.cmvDevolvido += custo;
  if (venda.totais.devolvido >= venda.totais.liquido) venda.status = 'devolvida';
  else if (venda.totais.devolvido > 0) venda.status = 'parcial';

  if (d.retornaEstoque !== false) {
    for (const it of itens) {
      const v = e.variantes[it.varianteId];
      if (!v) continue;
      v.saldo += it.qtd;
      v.vendidoTotal -= it.qtd;
      e.movimentos.push({
        id: d.id + '-' + it.varianteId, ts: ev.ts, data: d.data, varianteId: it.varianteId,
        tipo: 'devolucao', qtd: it.qtd, custoUnit: it.custoUnit, saldoDepois: v.saldo,
        ref: venda.id, refTipo: 'devolucao', obs: 'Devolução da venda #' + venda.numero,
      });
    }
  }
}

// =====================================================================
// Consultas de conveniencia sobre o estado
// =====================================================================

/** Nome completo de uma variante: "Vestido Lia — M / Preto" */
export function nomeVariante(estado, varianteId) {
  const v = estado.variantes[varianteId];
  if (!v) return '(item removido)';
  const p = estado.produtos[v.produtoId];
  const detalhe = [v.tamanho, v.cor].filter(Boolean).join(' / ');
  return (p ? p.nome : '(produto removido)') + (detalhe ? ' — ' + detalhe : '');
}

/** Preco de venda efetivo: o da variante quando existir, senao o do produto. */
export function precoDaVariante(estado, varianteId) {
  const v = estado.variantes[varianteId];
  if (!v) return 0;
  if (v.precoVenda !== null && v.precoVenda !== undefined) return v.precoVenda;
  const p = estado.produtos[v.produtoId];
  return p ? p.precoVenda : 0;
}

/** Saldo em fiado de um cliente (recebiveis do tipo fiado ainda em aberto). */
export function saldoFiado(estado, clienteId) {
  return Object.values(estado.recebiveis)
    .filter((r) => r.clienteId === clienteId && r.tipo === 'fiado' && r.status === 'aberto')
    .reduce((s, r) => s + r.liquido, 0);
}
