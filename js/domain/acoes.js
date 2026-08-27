// acoes.js — tudo que MUDA dado passa por aqui. As telas nao gravam sozinhas.

import * as log from '../core/eventlog.js';
import { novoId } from '../core/id.js';
import { iso, competencia, normaliza } from '../core/fmt.js';

const est = () => log.estado();

// ---------------- configuracao ----------------

export function definirConfig(caminho, valor) {
  return log.registrar('config.definida', { caminho, valor });
}

// ---------------- codigos ----------------

/**
 * Codigo de barras EAN-13 de uso interno. O prefixo 2 e' reservado pelo padrao
 * GS1 justamente para codigos de loja, entao nunca vai colidir com o codigo de
 * fabrica de outro produto.
 */
export function gerarEAN13() {
  const existentes = Object.values(est().variantes)
    .map((v) => v.codigoBarras)
    .filter((c) => c && c.length === 13 && c[0] === '2')
    .map((c) => parseInt(c.slice(1, 12), 10))
    .filter((n) => !isNaN(n));
  const proximo = (existentes.length ? Math.max(...existentes) : 0) + 1;
  const base = '2' + String(proximo).padStart(11, '0');
  return base + digitoEAN13(base);
}

export function digitoEAN13(doze) {
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (soma % 10)) % 10);
}

export function ean13Valido(codigo) {
  const c = String(codigo || '').trim();
  if (!/^\d{13}$/.test(c)) return false;
  return digitoEAN13(c.slice(0, 12)) === c[12];
}

/** SKU legivel: VES-PRE-M-0007 */
export function gerarSKU(nomeProduto, tamanho, cor, sequencial) {
  const pedaco = (s, n) => normaliza(s).replace(/[^a-z0-9]/g, '').slice(0, n).toUpperCase() || 'X';
  return [pedaco(nomeProduto, 3), cor ? pedaco(cor, 3) : null, pedaco(tamanho, 3),
    String(sequencial).padStart(4, '0')].filter(Boolean).join('-');
}

// ---------------- catalogo ----------------

/**
 * Cria o produto e suas variantes num lote so'.
 * variantes = [{tamanho, cor, precoVenda?, codigoBarras?}]
 */
export async function criarProduto(produto, variantes) {
  const produtoId = novoId();
  const eventos = [{ tipo: 'produto.criado', dados: { ...produto, id: produtoId } }];
  let seq = Object.keys(est().variantes).length;
  const codigos = [];
  for (const v of variantes) {
    seq++;
    const codigo = v.codigoBarras || proximoEAN(codigos);
    codigos.push(codigo);
    eventos.push({
      tipo: 'variante.criada',
      dados: {
        id: novoId(), produtoId,
        tamanho: v.tamanho || 'Único', cor: v.cor || '',
        sku: v.sku || gerarSKU(produto.nome, v.tamanho || 'U', v.cor, seq),
        codigoBarras: codigo,
        precoVenda: v.precoVenda === undefined ? null : v.precoVenda,
      },
    });
  }
  await log.registrarVarios(eventos);
  return produtoId;
}

/** Gera EAN considerando os que acabaram de ser gerados neste mesmo lote. */
function proximoEAN(jaGerados) {
  let codigo = gerarEAN13();
  let guarda = 0;
  while (jaGerados.includes(codigo) && guarda++ < 500) {
    const n = parseInt(codigo.slice(1, 12), 10) + 1 + guarda;
    const base = '2' + String(n).padStart(11, '0');
    codigo = base + digitoEAN13(base);
  }
  return codigo;
}

export function editarProduto(id, campos) {
  return log.registrar('produto.editado', { id, campos });
}

export function arquivarProduto(id) {
  return log.registrar('produto.arquivado', { id });
}

export function reativarProduto(id) {
  return log.registrar('produto.reativado', { id });
}

export async function adicionarVariantes(produtoId, variantes) {
  const p = est().produtos[produtoId];
  let seq = Object.keys(est().variantes).length;
  const codigos = [];
  const eventos = variantes.map((v) => {
    seq++;
    const codigo = v.codigoBarras || proximoEAN(codigos);
    codigos.push(codigo);
    return {
      tipo: 'variante.criada',
      dados: {
        id: novoId(), produtoId,
        tamanho: v.tamanho || 'Único', cor: v.cor || '',
        sku: v.sku || gerarSKU(p ? p.nome : 'ITEM', v.tamanho || 'U', v.cor, seq),
        codigoBarras: codigo,
        precoVenda: v.precoVenda === undefined ? null : v.precoVenda,
      },
    };
  });
  return log.registrarVarios(eventos);
}

export function editarVariante(id, campos) {
  return log.registrar('variante.editada', { id, campos });
}

export function arquivarVariante(id) {
  return log.registrar('variante.arquivada', { id });
}

// ---------------- estoque ----------------

/** entrada({itens:[{varianteId, qtd, custoUnit}], data, fornecedorId, documento, freteTotal, obs}) */
export function darEntrada(entrada) {
  return log.registrar('estoque.entrada', {
    id: novoId(),
    data: entrada.data || iso(),
    itens: entrada.itens,
    fornecedorId: entrada.fornecedorId || null,
    documento: entrada.documento || '',
    freteTotal: entrada.freteTotal || 0,
    obs: entrada.obs || '',
  });
}

/** Acerta o saldo para o valor contado. Motivo e' obrigatorio: estoque some por algum motivo. */
export function ajustarEstoque(varianteId, qtdNova, motivo, data) {
  return log.registrar('estoque.ajuste', {
    id: novoId(), varianteId, qtdNova, motivo: motivo || 'Ajuste manual', data: data || iso(),
  });
}

/** Inventario: um ajuste por item contado que divergiu. */
export async function lancarInventario(contagens, data) {
  const e = est();
  const eventos = [];
  for (const { varianteId, qtdContada } of contagens) {
    const v = e.variantes[varianteId];
    if (!v || v.saldo === qtdContada) continue;
    eventos.push({
      tipo: 'estoque.ajuste',
      dados: { id: novoId(), varianteId, qtdNova: qtdContada, motivo: 'Inventário', data: data || iso() },
    });
  }
  if (!eventos.length) return [];
  return log.registrarVarios(eventos);
}

// ---------------- vendas ----------------

/**
 * venda({itens, pagamentos, canal, clienteId, descontoGeral, freteCobrado, data, obs})
 * itens = [{varianteId, qtd, precoUnit, descontoUnit}]
 * pagamentos = [{forma, valor, parcelas, bandeira, taxaPct, prazoDias, vencimento}]
 */
export function registrarVenda(venda) {
  const numero = (est().contadores.venda || 0) + 1;
  const agora = new Date();
  return log.registrar('venda.registrada', {
    id: novoId(),
    numero,
    data: venda.data || iso(),
    hora: venda.hora || String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0'),
    canal: venda.canal || 'loja',
    clienteId: venda.clienteId || null,
    itens: venda.itens,
    descontoGeral: venda.descontoGeral || 0,
    freteCobrado: venda.freteCobrado || 0,
    pagamentos: venda.pagamentos || [],
    obs: venda.obs || '',
  });
}

export function cancelarVenda(vendaId, motivo) {
  return log.registrar('venda.cancelada', { vendaId, motivo: motivo || '', data: iso() });
}

/** devolver(vendaId, [{varianteId, qtd}], {motivo, retornaEstoque, formaDevolucao}) */
export function devolverVenda(vendaId, itens, opcoes = {}) {
  return log.registrar('venda.devolvida', {
    id: novoId(), vendaId, itens,
    data: opcoes.data || iso(),
    motivo: opcoes.motivo || '',
    retornaEstoque: opcoes.retornaEstoque !== false,
    formaDevolucao: opcoes.formaDevolucao || 'dinheiro',
  });
}

// ---------------- despesas ----------------

export function lancarDespesa(despesa) {
  return log.registrar('despesa.lancada', {
    id: novoId(),
    data: despesa.data || iso(),
    competencia: despesa.competencia || competencia(despesa.data || iso()),
    categoria: despesa.categoria,
    tipo: despesa.tipo || 'variavel',
    descricao: despesa.descricao || '',
    valor: despesa.valor || 0,
    fornecedor: despesa.fornecedor || '',
    formaPagto: despesa.formaPagto || 'pix',
    pago: despesa.pago !== false,
    dataPagto: despesa.dataPagto || despesa.data || iso(),
    recorrente: !!despesa.recorrente,
    obs: despesa.obs || '',
  });
}

export function editarDespesa(id, campos) {
  return log.registrar('despesa.editada', { id, campos });
}

export function excluirDespesa(id) {
  return log.registrar('despesa.excluida', { id });
}

/** Repete no mes seguinte todas as despesas marcadas como recorrentes. */
export async function repetirRecorrentes(compOrigem, compDestino) {
  const e = est();
  const [ano, mes] = compDestino.split('-').map(Number);
  const eventos = [];
  for (const d of Object.values(e.despesas)) {
    if (!d.recorrente || d.competencia !== compOrigem) continue;
    const jaExiste = Object.values(e.despesas).some(
      (x) => x.competencia === compDestino && x.categoria === d.categoria && x.descricao === d.descricao
    );
    if (jaExiste) continue;
    const dia = Math.min(Number(d.data.slice(8, 10)), new Date(ano, mes, 0).getDate());
    const data = `${compDestino}-${String(dia).padStart(2, '0')}`;
    eventos.push({
      tipo: 'despesa.lancada',
      dados: { ...d, id: novoId(), data, competencia: compDestino, dataPagto: data, pago: false, criadoEm: undefined },
    });
  }
  if (!eventos.length) return [];
  return log.registrarVarios(eventos);
}

// ---------------- pessoas ----------------

export async function criarCliente(cliente) {
  const id = novoId();
  await log.registrar('cliente.criado', { ...cliente, id });
  return id;
}

export function editarCliente(id, campos) {
  return log.registrar('cliente.editado', { id, campos });
}

export function arquivarCliente(id) {
  return log.registrar('cliente.arquivado', { id });
}

export async function criarFornecedor(fornecedor) {
  const id = novoId();
  await log.registrar('fornecedor.criado', { ...fornecedor, id });
  return id;
}

// ---------------- financeiro ----------------

export function baixarRecebivel(recebivelId, forma, data) {
  return log.registrar('recebivel.baixado', { recebivelId, forma: forma || '', data: data || iso() });
}

/**
 * Lanca um saldo a receber que veio de fora — tipicamente a planilha de fiado
 * anterior ao app. Nao cria venda, nao mexe no estoque e nao entra como receita
 * na DRE: e' divida velha entrando no controle, nao venda nova.
 * importarRecebivel({clienteId, valor, vencimento, descricao, tipo, origem})
 */
export function importarRecebivel(dados) {
  return log.registrar('recebivel.importado', {
    id: novoId(),
    clienteId: dados.clienteId || null,
    valor: dados.valor || 0,
    vencimento: dados.vencimento,
    data: dados.data || dados.vencimento,
    tipo: dados.tipo || 'fiado',
    descricao: dados.descricao || '',
    origem: dados.origem || 'importado',
  });
}

export function estornarRecebivel(recebivelId) {
  return log.registrar('recebivel.estornado', { recebivelId });
}

/** Baixa varios de uma vez (ex.: o repasse da maquininha caiu hoje). */
export async function baixarVarios(ids, forma, data) {
  if (!ids.length) return [];
  return log.registrarVarios(ids.map((recebivelId) => ({
    tipo: 'recebivel.baixado',
    dados: { recebivelId, forma: forma || '', data: data || iso() },
  })));
}

// ---------------- metas ----------------

/**
 * Marca que a provisao do mes foi guardada. E' marcacao manual: o app nao ve' a
 * conta da reserva, entao quem sabe se o dinheiro foi separado e' o dono.
 */
export function marcarProvisao(provisaoId, comp, valor) {
  return log.registrar('provisao.guardada', {
    provisaoId, competencia: comp, valor: valor || 0, data: iso(),
  });
}

export function desmarcarProvisao(provisaoId, comp) {
  return log.registrar('provisao.desfeita', { provisaoId, competencia: comp });
}

export function lancarImposto({ comp, valor, data, tipo = 'DAS-MEI', pago = true }) {
  return log.registrar('imposto.lancado', {
    id: novoId(), competencia: comp, valor, data: data || iso(), tipo, pago,
  });
}
