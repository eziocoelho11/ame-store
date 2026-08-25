// demo.js — povoa o app com um mes ficticio, para conhecer as telas antes de
// lancar dado de verdade. Tudo aqui e' evento normal: para tirar, e' so' usar
// "Apagar dados deste aparelho" em Ajustes.

import * as acoes from './acoes.js';
import * as log from '../core/eventlog.js';
import { iso, somaDias, competencia } from '../core/fmt.js';

const PRODUTOS = [
  { nome: 'Vestido midi Lia', categoria: 'Vestidos', preco: 18990, custo: 7900, tamanhos: ['P', 'M', 'G'], cores: ['Preto', 'Terracota'] },
  { nome: 'Blusa cropped Ana', categoria: 'Blusas', preco: 8990, custo: 3200, tamanhos: ['P', 'M'], cores: ['Off white', 'Preto'] },
  { nome: 'Calça wide leg Bia', categoria: 'Calças', preco: 22900, custo: 9800, tamanhos: ['38', '40', '42'], cores: ['Jeans claro'] },
  { nome: 'Conjunto tricot Duda', categoria: 'Conjuntos', preco: 27900, custo: 12500, tamanhos: ['Único'], cores: ['Bege', 'Verde militar'] },
  { nome: 'Saia jeans Mel', categoria: 'Saias', preco: 13900, custo: 5400, tamanhos: ['36', '38', '40'], cores: ['Jeans escuro'] },
];

const CLIENTES = [
  { nome: 'Juliana Prado', telefone: '31988887777' },
  { nome: 'Camila Rezende', telefone: '31977776666' },
  { nome: 'Fernanda Alves', telefone: '31966665555' },
];

// Gerador previsivel: a demo sai igual toda vez, o que ajuda a comparar telas.
function sorteio(semente) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

export async function carregarDemonstracao() {
  const r = sorteio(20260825);
  const hoje = iso();
  const inicioMes = competencia(hoje) + '-01';

  // Taxas de exemplo, marcadas como exemplo — o dono troca pelas reais.
  await acoes.definirConfig('taxas', [
    { id: 't-deb', forma: 'debito', parcelasDe: 1, parcelasAte: 1, taxaPct: 1.99, prazoDias: 1 },
    { id: 't-cred1', forma: 'credito', parcelasDe: 1, parcelasAte: 1, taxaPct: 3.49, prazoDias: 30 },
    { id: 't-cred2', forma: 'credito', parcelasDe: 2, parcelasAte: 6, taxaPct: 4.99, prazoDias: 30 },
    { id: 't-cred7', forma: 'credito', parcelasDe: 7, parcelasAte: 12, taxaPct: 6.49, prazoDias: 30 },
  ]);

  // Comissoes de exemplo — marketplace cobra caro, e a DRE precisa mostrar isso.
  await acoes.definirConfig('canais', [
    { id: 'loja', nome: 'Loja física', comissaoPct: 0 },
    { id: 'instagram', nome: 'Instagram / WhatsApp', comissaoPct: 0 },
    { id: 'marketplace', nome: 'Marketplace', comissaoPct: 14 },
  ]);

  const clientes = [];
  for (const c of CLIENTES) clientes.push(await acoes.criarCliente(c));

  const variantes = [];
  for (const p of PRODUTOS) {
    const grade = [];
    for (const cor of p.cores) for (const t of p.tamanhos) grade.push({ tamanho: t, cor });
    const pid = await acoes.criarProduto(
      { nome: p.nome, categoria: p.categoria, precoVenda: p.preco, estoqueMinimo: 2 }, grade);
    const e = log.estado();
    for (const vid of e.produtos[pid].variantes) variantes.push({ id: vid, custo: p.custo, preco: p.preco });
  }

  // Compra inicial: 6 pecas de cada, com frete.
  await acoes.darEntrada({
    data: somaDias(inicioMes, -3),
    documento: 'NF 1042 (demonstração)',
    obs: 'Fornecedor exemplo',
    freteTotal: 18000,
    itens: variantes.map((v) => ({ varianteId: v.id, qtd: 6, custoUnit: v.custo })),
  });

  // Vendas espalhadas pelo mes.
  const canais = ['loja', 'loja', 'loja', 'instagram', 'marketplace'];
  const diaDeHoje = Number(hoje.slice(8, 10));
  for (let dia = 1; dia <= diaDeHoje; dia++) {
    const quantasVendas = Math.floor(r() * 3);
    for (let k = 0; k < quantasVendas; k++) {
      const data = `${competencia(hoje)}-${String(dia).padStart(2, '0')}`;
      const canal = canais[Math.floor(r() * canais.length)];
      const nItens = 1 + Math.floor(r() * 2);
      const itens = [];
      for (let i = 0; i < nItens; i++) {
        const v = variantes[Math.floor(r() * variantes.length)];
        if (itens.some((x) => x.varianteId === v.id)) continue;
        itens.push({ varianteId: v.id, qtd: 1, precoUnit: v.preco, descontoUnit: r() > 0.8 ? 1000 : 0 });
      }
      if (!itens.length) continue;
      const total = itens.reduce((s, i) => s + i.precoUnit - i.descontoUnit, 0);

      const sorte = r();
      let pagamentos;
      if (sorte < 0.3) pagamentos = [{ forma: 'pix', valor: total }];
      else if (sorte < 0.45) pagamentos = [{ forma: 'dinheiro', valor: total }];
      else if (sorte < 0.65) pagamentos = [{ forma: 'debito', valor: total }];
      else if (sorte < 0.92) pagamentos = [{ forma: 'credito', valor: total, parcelas: 1 + Math.floor(r() * 3) }];
      else pagamentos = [{ forma: 'fiado', valor: total, vencimento: somaDias(data, 30) }];

      const comCliente = pagamentos[0].forma === 'fiado' || r() > 0.6;
      await acoes.registrarVenda({
        data, canal, itens, pagamentos,
        clienteId: comCliente ? clientes[Math.floor(r() * clientes.length)] : null,
        freteCobrado: canal === 'marketplace' ? 1990 : 0,
      });
    }
  }

  // Despesas do mes.
  const despesas = [
    ['Aluguel', 'fixa', 180000, 5], ['Energia', 'fixa', 24000, 10],
    ['Água', 'fixa', 8000, 10], ['Internet e telefone', 'fixa', 12000, 8],
    ['Contabilidade', 'fixa', 25000, 5], ['Marketing e anúncios', 'variavel', 30000, 12],
    ['Embalagens e sacolas', 'variavel', 9500, 6], ['Material de loja', 'variavel', 4300, 15],
  ];
  for (const [categoria, tipo, valor, dia] of despesas) {
    if (dia > diaDeHoje) continue;
    await acoes.lancarDespesa({
      data: `${competencia(hoje)}-${String(dia).padStart(2, '0')}`,
      categoria, tipo, valor, descricao: 'Demonstração', recorrente: tipo === 'fixa',
    });
  }

  return {
    produtos: PRODUTOS.length,
    vendas: Object.keys(log.estado().vendas).length,
    clientes: clientes.length,
  };
}
