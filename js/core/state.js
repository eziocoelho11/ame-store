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
  // Canal responde ONDE a venda aconteceu, e a pergunta que ele existe para
  // responder e' se o ponto fixo se paga: "Loja física" e' o balcao, "Vendas por
  // fora" e' a peca levada ao cliente. Sao os dois lados da mesma decisao.
  canais: [
    { id: 'loja', nome: 'Loja física', comissaoPct: 0 },
    { id: 'externa', nome: 'Vendas por fora', comissaoPct: 0 },
    { id: 'instagram', nome: 'Instagram / WhatsApp', comissaoPct: 0 },
    { id: 'marketplace', nome: 'Marketplace', comissaoPct: 0 },
  ],
  // Canais que contam como "dentro do ponto fixo" na comparacao de Relatorios.
  // Fica na config, e nao no codigo, porque quem decide o que e' balcao e' a
  // loja: um dia uma feira fixa pode virar ponto, e vice-versa.
  canaisDoPonto: ['loja'],
  // Maquininhas. Nasce vazio: quem instala cadastra as suas em Ajustes, com a
  // taxa de cada uma. `antecipa` = a operadora paga a venda inteira de uma vez,
  // ja' descontada a taxa — e' o padrao do mercado hoje, e muda a agenda de
  // caixa por completo: credito em 3x deixa de ser tres entradas futuras e
  // passa a ser uma entrada agora.
  operadoras: [],
  // Taxas comecam em zero: cada maquininha cobra o seu. Preencher em Ajustes.
  // Regra sem `operadoraId` vale como regra geral, para quem nao usa maquininha
  // cadastrada — e' o que mantem funcionando o que foi configurado antes das
  // operadoras existirem.
  taxas: [
    { id: 't-deb', forma: 'debito', parcelasDe: 1, parcelasAte: 1, taxaPct: 0, prazoDias: 1 },
    { id: 't-cred1', forma: 'credito', parcelasDe: 1, parcelasAte: 1, taxaPct: 0, prazoDias: 30 },
    { id: 't-cred2', forma: 'credito', parcelasDe: 2, parcelasAte: 6, taxaPct: 0, prazoDias: 30 },
    { id: 't-cred7', forma: 'credito', parcelasDe: 7, parcelasAte: 12, taxaPct: 0, prazoDias: 30 },
  ],
  categoriasProduto: ['Vestidos', 'Blusas', 'Calças', 'Saias', 'Shorts', 'Conjuntos',
    'Casacos e jaquetas', 'Macacões', 'Lingerie', 'Moda praia', 'Acessórios', 'Calçados', 'Bolsas'],
  // Metas da loja. Nascem vazias de proposito: meta e' decisao do dono, e uma
  // meta chutada pelo app viraria cobranca sem sentido. `vendasPorMes` sobrepoe
  // `vendasPadrao` no mes que tiver numero proprio.
  metas: { vendasPadrao: 0, vendasPorMes: {}, provisoes: [] },
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
    provisoesFeitas: {},
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
    case 'venda.trocada': trocarVenda(e, ev, d); break;

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
        // Se ela ja' estava paga ANTES desta edicao, a data de pagamento e'
        // fato consumado e nao se mexe. Le antes do Object.assign de proposito.
        const estavaPaga = e.despesas[d.id].pago;
        Object.assign(e.despesas[d.id], d.campos);
        if (d.campos && d.campos.data) {
          e.despesas[d.id].competencia = competencia(d.campos.data);
          // Enquanto nao foi paga, a data de pagamento e' so' expectativa: ela
          // segue a data nova. Sem isto, remarcar a conta para o mes seguinte
          // movia a competencia e deixava o caixa preso no mes velho.
          if (!estavaPaga) e.despesas[d.id].dataPagto = d.campos.data;
        }
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
        const falta = Math.max(0, r.liquido - (r.pago || 0));
        if (falta > 0) {
          r.pagamentos = r.pagamentos || [];
          r.pagamentos.push({ valor: falta, data: d.data, forma: d.forma || '' });
        }
        r.pago = r.liquido;
        r.saldo = 0;
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
        pago: 0, saldo: valor, pagamentos: [],
        origem: d.origem || 'importado', descricao: d.descricao || '',
      };
      break;
    }
    /**
     * Abatimento: o cliente pagou UMA PARTE da parcela. Enquanto faltar, a
     * parcela fica 'parcial' — continua a receber, mas ja' com o que entrou
     * descontado. Quando o total pago alcanca o valor, vira 'recebido'
     * sozinho, sem precisar de outro lancamento.
     */
    case 'recebivel.abatido': {
      const r = e.recebiveis[d.recebivelId];
      if (!r || r.status === 'cancelado') break;
      const valor = Math.max(0, Math.min(d.valor || 0, (r.saldo === undefined ? r.liquido : r.saldo)));
      if (!valor) break;
      r.pagamentos = r.pagamentos || [];
      r.pagamentos.push({ valor, data: d.data, forma: d.forma || '', obs: d.obs || '' });
      r.pago = (r.pago || 0) + valor;
      r.saldo = Math.max(0, r.liquido - r.pago);
      if (r.saldo === 0) {
        r.status = 'recebido';
        r.recebidoEm = d.data;
        r.formaRecebimento = d.forma || r.tipo;
      } else {
        r.status = 'parcial';
      }
      break;
    }
    /**
     * Correcao de uma parcela em aberto: mudou a data combinada ou o valor.
     * Fiado se renegocia na porta da loja ("passa pro dia 10", "deixa 150 que
     * eu fecho"), e ate' agora a unica saida era estornar e lancar de novo.
     *
     * O valor editado e' o BRUTO. A taxa e' recalculada pelo percentual que a
     * parcela ja' tinha, e o liquido sai da diferenca. Como a taxa entra na DRE
     * pela venda, a venda de origem e' ajustada pela diferenca — senao a DRE
     * passaria a deduzir uma taxa que nao existe mais.
     *
     * A RECEITA da venda NAO muda: o que foi vendido continua o que foi
     * vendido. Reduzir a parcela e' desconto dado depois, nao venda menor. A
     * tela avisa isso na hora de salvar.
     */
    case 'recebivel.editado': {
      const r = e.recebiveis[d.recebivelId];
      if (!r || r.status === 'cancelado') break;
      const c = d.campos || {};
      if (c.vencimento) r.vencimento = c.vencimento;
      if (c.bruto !== undefined && c.bruto !== null) {
        const bruto = Math.max(0, c.bruto);
        const taxa = aplicaPct(bruto, r.taxaPct || 0);
        const venda = r.vendaId ? e.vendas[r.vendaId] : null;
        if (venda) venda.totais.taxas += taxa - (r.taxa || 0);
        r.bruto = bruto;
        r.taxa = taxa;
        r.liquido = bruto - taxa;
      }
      // Refaz o que falta a partir do que ja' entrou de verdade. Isso tambem
      // cobre a ordem inversa no replay (a baixa chegando de outro aparelho
      // antes da edicao): quem manda e' a soma dos pagamentos, nao o campo.
      const pago = (r.pagamentos || []).reduce((soma, pg) => soma + pg.valor, 0);
      r.pago = pago;
      r.saldo = Math.max(0, r.liquido - pago);
      if (r.saldo === 0 && pago > 0) {
        r.status = 'recebido';
        const ultimo = (r.pagamentos || [])[r.pagamentos.length - 1];
        r.recebidoEm = r.recebidoEm || (ultimo ? ultimo.data : d.data || null);
        r.formaRecebimento = r.formaRecebimento || (ultimo ? ultimo.forma : null) || r.tipo;
      } else {
        r.status = pago > 0 ? 'parcial' : 'aberto';
        r.recebidoEm = null;
        r.formaRecebimento = null;
      }
      r.editadoEm = ev.ts;
      r.motivoEdicao = d.motivo || '';
      break;
    }
    case 'recebivel.estornado': {
      const r = e.recebiveis[d.recebivelId];
      // Estorno desfaz a parcela inteira, inclusive abatimentos parciais: ela
      // volta a dever tudo. Desfazer so' o ultimo pagamento seria outro evento.
      if (r) {
        r.status = 'aberto';
        r.recebidoEm = null;
        r.formaRecebimento = null;
        r.pago = 0;
        r.saldo = r.liquido;
        r.pagamentos = [];
      }
      break;
    }
    /**
     * Provisao guardada no mes. E' marcacao manual porque so' o dono sabe se o
     * dinheiro foi mesmo separado — o app nao ve' a conta da reserva.
     * A chave junta provisao e competencia: marcar agosto nao marca setembro.
     */
    case 'provisao.guardada':
      e.provisoesFeitas[d.provisaoId + '|' + d.competencia] = {
        provisaoId: d.provisaoId, competencia: d.competencia,
        valor: d.valor || 0, data: d.data || null,
      };
      break;
    case 'provisao.desfeita':
      delete e.provisoesFeitas[d.provisaoId + '|' + d.competencia];
      break;

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

/**
 * Encontra a regra de taxa para a forma, o numero de parcelas e a maquininha.
 *
 * A busca e' em degraus, e a ordem importa: primeiro a regra DA operadora
 * escolhida; se ela nao tiver faixa para esse numero de parcelas, cai na regra
 * geral (a sem operadoraId, que e' como as taxas eram antes de existir
 * operadora); e por ultimo o padrao zerado. Nunca empresta a taxa de OUTRA
 * operadora: cobrar a taxa da Nubank numa venda da PagSeguro seria um numero
 * errado que ninguem desconfia.
 *
 * Devolve tambem `antecipa` e o nome da operadora, resolvidos da config.
 */
export function taxaPara(config, forma, parcelas, operadoraId = '') {
  const lista = config.taxas || [];
  const cabe = (t) => t.forma === forma && parcelas >= t.parcelasDe && parcelas <= t.parcelasAte;
  const op = (config.operadoras || []).find((o) => o.id === operadoraId) || null;
  const regra = (operadoraId ? lista.filter((t) => t.operadoraId === operadoraId).find(cabe) : null)
    || lista.filter((t) => !t.operadoraId).find(cabe)
    || (forma === 'debito' ? { taxaPct: 0, prazoDias: 1 }
      : forma === 'credito' ? { taxaPct: 0, prazoDias: 30 }
      : { taxaPct: 0, prazoDias: 0 });
  return {
    ...regra,
    operadoraId: op ? op.id : '',
    operadoraNome: op ? op.nome : '',
    antecipa: op ? op.antecipa !== false : false,
  };
}

/** Maquininhas em uso, para os seletores das telas. */
export function operadorasAtivas(config) {
  return (config.operadoras || []).filter((o) => o.ativa !== false);
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
    status: 'ativa', devolucoes: [], trocas: [],
    totais: { bruto, desconto, liquido, cmv, comissaoCanal, taxas: 0, devolvido: 0, cmvDevolvido: 0,
      trocaDiferenca: 0, trocaCmvDelta: 0 },
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
    const regra = taxaPara(e.config, forma, nParcelas, pg.operadoraId || '');
    const taxaPct = (pg.taxaPct === undefined || pg.taxaPct === null) ? regra.taxaPct : pg.taxaPct;
    const prazoDias = (pg.prazoDias === undefined || pg.prazoDias === null) ? regra.prazoDias : pg.prazoDias;
    /**
     * ANTECIPACAO. Hoje as operadoras pagam a venda inteira de uma vez, ja'
     * descontada a taxa da quantidade de parcelas. A cliente paga em 3x para o
     * banco DELA; a loja recebe uma vez. Entao e' UM recebivel, nao tres.
     *
     * A decisao vem do EVENTO, nao da config: `pg.antecipa` foi gravado como
     * verdadeiro pela tela no dia da venda. Se viesse da config, ligar a
     * antecipacao hoje reescreveria a agenda de todas as vendas antigas no
     * replay — venda de marco em 3x viraria caixa de marco, e o fluxo de caixa
     * fechado mudaria sozinho. Evento antigo nao tem o campo, entao continua
     * gerando as parcelas como antes.
     */
    const antecipado = pg.antecipa === true && (forma === 'credito' || forma === 'debito');
    const valores = antecipado ? [pg.valor] : dividirCentavos(pg.valor, nParcelas);

    valores.forEach((valorParcela, i) => {
      const taxa = aplicaPct(valorParcela, taxaPct);
      taxasTotais += taxa;
      // Antecipacao com prazo zero cai no mesmo dia: entra no caixa como
      // dinheiro, sem ninguem precisar dar baixa. Com prazo de 1 ou 2 dias,
      // fica em "a receber" ate' a data — e' o que a operadora faz de verdade.
      const imediato = (forma === 'dinheiro' || forma === 'pix')
        || (antecipado && (prazoDias || 0) === 0);
      // Fiado: se a venda trouxe uma data para CADA parcela, ela manda — cliente
      // que combina "dia 10 e depois dia 5" nao cabe numa regra fixa. Sem isso,
      // a 1a vence na data combinada e as seguintes caem de mes em mes, no mesmo
      // dia. Cartao segue o prazo de repasse da maquininha.
      const combinados = Array.isArray(pg.vencimentos) ? pg.vencimentos : null;
      const vencimento = forma === 'fiado'
        ? ((combinados && combinados[i]) || somaMesesData(pg.vencimento || d.data, i))
        : antecipado ? somaDias(d.data, prazoDias || 0)
        : imediato ? d.data : somaDias(d.data, (prazoDias || 30) * (i + 1));
      const rid = d.id + '#' + idxPg + '#' + (i + 1);
      e.recebiveis[rid] = {
        id: rid, vendaId: d.id, numeroVenda: d.numero, clienteId: d.clienteId || null,
        tipo: forma, bandeira: pg.bandeira || '',
        // Antecipado e' um recebivel so'. Quantas vezes a CLIENTE dividiu fica
        // em parcelasCliente: e' o que explica a taxa mais alta na tela.
        parcela: i + 1, totalParcelas: antecipado ? 1 : nParcelas,
        parcelasCliente: nParcelas, antecipado,
        operadoraId: pg.operadoraId || null, operadora: pg.operadora || regra.operadoraNome || '',
        bruto: valorParcela, taxaPct, taxa, liquido: valorParcela - taxa,
        vencimento, data: d.data,
        status: imediato ? 'recebido' : 'aberto',
        recebidoEm: imediato ? d.data : null,
        formaRecebimento: imediato ? forma : null,
        // Fiado nem sempre e' pago inteiro na data: a parcela guarda quanto ja'
        // entrou, quanto falta e cada abatimento com a sua data.
        pago: imediato ? valorParcela - taxa : 0,
        saldo: imediato ? 0 : valorParcela - taxa,
        pagamentos: imediato ? [{ valor: valorParcela - taxa, data: d.data, forma }] : [],
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
  // Venda que teve troca: o estoque de hoje reflete a troca, nao a venda
  // original. Desfazer so' os itens vendidos deixaria a peca nova fora do
  // estoque e a devolvida contada duas vezes. Entao cada troca e' desfeita ao
  // contrario: a peca nova volta, a devolvida sai.
  for (const t of venda.trocas || []) {
    for (const it of t.novos) {
      const v = e.variantes[it.varianteId];
      if (!v) continue;
      v.saldo += it.qtd;
      v.vendidoTotal -= it.qtd;
      e.movimentos.push({
        id: 'canc-' + t.id + '-nov-' + it.varianteId, ts: ev.ts, data: d.data,
        varianteId: it.varianteId, tipo: 'cancelamento', qtd: it.qtd,
        custoUnit: it.custoUnit, saldoDepois: v.saldo, ref: venda.id, refTipo: 'cancelamento',
        obs: 'Cancelamento da troca da venda #' + venda.numero,
      });
    }
    if (t.retornaEstoque) {
      for (const it of t.devolvidos) {
        const v = e.variantes[it.varianteId];
        if (!v) continue;
        v.saldo -= it.qtd;
        v.vendidoTotal += it.qtd;
        e.movimentos.push({
          id: 'canc-' + t.id + '-dev-' + it.varianteId, ts: ev.ts, data: d.data,
          varianteId: it.varianteId, tipo: 'cancelamento', qtd: -it.qtd,
          custoUnit: it.custoUnit, saldoDepois: v.saldo, ref: venda.id, refTipo: 'cancelamento',
          obs: 'Cancelamento da troca da venda #' + venda.numero,
        });
      }
    }
  }

  // Pega tambem o recebivel da diferenca de troca: ele tem o vendaId da venda.
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

/**
 * TROCA: a cliente traz uma peca e leva outra.
 *
 * E' uma devolucao e uma venda no mesmo ato, e por isso nao da' para modelar
 * como uma coisa so'. O que este evento faz:
 *
 *   estoque   — a peca devolvida volta (se puder ser revendida) e a peca nova sai
 *   receita   — entra SO' A DIFERENCA, no mes da troca
 *   CMV       — troca o custo da peca que voltou pelo custo da que saiu
 *   caixa     — a diferenca a receber vira recebivel, igual a qualquer venda
 *
 * Por que so' a diferenca vira receita: a peca devolvida ja' foi faturada no mes
 * da venda. Faturar a peca nova inteira contaria a mesma venda duas vezes e
 * inflaria o teto do MEI. Trocar uma peca de 189,90 por outra de 219,90 e' 30,00
 * de receita nova, e e' isso que a cliente pagou a mais.
 *
 * Por que no mes da troca, e nao no da venda: e' a mesma regra da devolucao.
 * Mexer em mes fechado bagunca o historico, e a peca nova saiu do estoque hoje.
 *
 * A venda original NAO e' reescrita: `itens` continua sendo o que foi vendido
 * naquele dia. O que a cliente levou para casa esta' na lista `trocas`.
 */
function trocarVenda(e, ev, d) {
  const venda = e.vendas[d.vendaId];
  if (!venda || venda.status === 'cancelada') return;

  // Peca que volta: sai pelo preco e pelo custo com que foi vendida. E' a mesma
  // conta da devolucao, porque metade de uma troca E' uma devolucao.
  const devolvidos = (d.devolvidos || []).map((it) => {
    const orig = venda.itens.find((x) => x.varianteId === it.varianteId);
    const precoUnit = orig ? (orig.precoUnit - orig.descontoUnit) : 0;
    const custoUnit = orig ? orig.custoUnit : 0;
    return { varianteId: it.varianteId, qtd: it.qtd, valor: precoUnit * it.qtd,
      custo: custoUnit * it.qtd, custoUnit };
  });

  // Peca que sai: custo pelo custo medio VIGENTE neste ponto do replay, igual a
  // uma venda normal. Nao confiamos no custo que a tela mandou.
  const novos = (d.novos || []).map((it) => {
    const v = e.variantes[it.varianteId];
    const custoUnit = v ? v.custoMedio : (it.custoUnit || 0);
    const precoUnit = it.precoUnit || 0;
    return { varianteId: it.varianteId, qtd: it.qtd, precoUnit,
      valor: precoUnit * it.qtd, custo: custoUnit * it.qtd, custoUnit };
  });

  const valorDevolvido = devolvidos.reduce((soma, i) => soma + i.valor, 0);
  const custoDevolvido = devolvidos.reduce((soma, i) => soma + i.custo, 0);
  const valorNovo = novos.reduce((soma, i) => soma + i.valor, 0);
  const custoNovo = novos.reduce((soma, i) => soma + i.custo, 0);
  // A diferenca vem da tela: a loja arredonda ("deixa 20 que ta' bom") e quem
  // decide isso e' a dona, nao a subtracao. Sem valor informado, e' a conta.
  const diferenca = (d.diferenca === undefined || d.diferenca === null)
    ? valorNovo - valorDevolvido
    : d.diferenca;
  const retornaEstoque = d.retornaEstoque !== false;

  const troca = {
    id: d.id, data: d.data, motivo: d.motivo || '',
    devolvidos, novos,
    valorDevolvido, custoDevolvido, valorNovo, custoNovo,
    diferenca, formaDiferenca: d.formaDiferenca || '', retornaEstoque,
    // Taxa da maquininha sobre a diferenca. Fica AQUI, e nao em totais.taxas da
    // venda, porque a DRE le' totais.taxas no mes da venda: troca de setembro
    // numa venda de agosto jogaria a taxa no mes fechado.
    taxaDiferenca: 0,
  };
  venda.trocas = venda.trocas || [];
  venda.trocas.push(troca);
  venda.totais.trocaDiferenca = (venda.totais.trocaDiferenca || 0) + diferenca;
  venda.totais.trocaCmvDelta = (venda.totais.trocaCmvDelta || 0) + (custoNovo - custoDevolvido);

  if (retornaEstoque) {
    for (const it of devolvidos) {
      const v = e.variantes[it.varianteId];
      if (!v) continue;
      v.saldo += it.qtd;
      v.vendidoTotal -= it.qtd;
      e.movimentos.push({
        id: d.id + '-dev-' + it.varianteId, ts: ev.ts, data: d.data, varianteId: it.varianteId,
        tipo: 'troca-entrada', qtd: it.qtd, custoUnit: it.custoUnit, saldoDepois: v.saldo,
        ref: venda.id, refTipo: 'troca', obs: 'Troca da venda #' + venda.numero,
      });
    }
  }
  for (const it of novos) {
    const v = e.variantes[it.varianteId];
    if (!v) continue;
    v.saldo -= it.qtd;
    v.vendidoTotal += it.qtd;
    e.movimentos.push({
      id: d.id + '-nov-' + it.varianteId, ts: ev.ts, data: d.data, varianteId: it.varianteId,
      tipo: 'troca-saida', qtd: -it.qtd, custoUnit: it.custoUnit, saldoDepois: v.saldo,
      ref: venda.id, refTipo: 'troca', obs: 'Troca da venda #' + venda.numero,
    });
  }

  // Diferenca a favor da loja: vira recebivel como qualquer venda, para entrar
  // no caixa no dia certo. Dinheiro e PIX entram na hora; cartao e fiado ficam
  // a receber. Diferenca a favor da CLIENTE nao gera recebivel negativo — ela
  // ja' esta' descontada da receita do mes, e o app nao tem conta de saida.
  if (diferenca > 0) {
    const forma = d.formaDiferenca || 'dinheiro';
    const regra = taxaPara(e.config, forma, 1, d.operadoraDiferenca || '');
    const antecipado = d.antecipaDiferenca === true && (forma === 'credito' || forma === 'debito');
    const imediato = (forma === 'dinheiro' || forma === 'pix')
      || (antecipado && (regra.prazoDias || 0) === 0);
    const taxaPct = (forma === 'dinheiro' || forma === 'pix') ? 0 : regra.taxaPct;
    const taxa = aplicaPct(diferenca, taxaPct);
    const liquido = diferenca - taxa;
    const vencimento = d.vencimentoDiferenca
      || (imediato ? d.data : somaDias(d.data, regra.prazoDias || (antecipado ? 0 : 30)));
    const rid = 'troca-' + d.id;
    e.recebiveis[rid] = {
      id: rid, vendaId: venda.id, numeroVenda: venda.numero, clienteId: venda.clienteId || null,
      tipo: forma, bandeira: '', parcela: 1, totalParcelas: 1,
      bruto: diferenca, taxaPct, taxa, liquido,
      vencimento, data: d.data,
      status: imediato ? 'recebido' : 'aberto',
      recebidoEm: imediato ? d.data : null,
      formaRecebimento: imediato ? forma : null,
      pago: imediato ? liquido : 0,
      saldo: imediato ? 0 : liquido,
      pagamentos: imediato ? [{ valor: liquido, data: d.data, forma }] : [],
      parcelasCliente: 1, antecipado,
      operadoraId: d.operadoraDiferenca || null, operadora: regra.operadoraNome || '',
      origem: 'troca', descricao: 'diferença de troca',
    };
    troca.taxaDiferenca = taxa;
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

/** Saldo em fiado de um cliente: o que FALTA, ja' descontado o que ele adiantou. */
export function saldoFiado(estado, clienteId) {
  return Object.values(estado.recebiveis)
    .filter((r) => r.clienteId === clienteId && r.tipo === 'fiado'
      && (r.status === 'aberto' || r.status === 'parcial'))
    .reduce((s, r) => s + (r.saldo === undefined ? r.liquido : r.saldo), 0);
}
