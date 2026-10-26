// Tela de Estoque — catalogo por produto, com as variantes (tamanho/cor) dentro.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { listarVariantes, valorEstoque, estoqueBaixo } from '../../domain/consultas.js';
import { brl, esc, normaliza, num } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, vazio, liga, toast, modalFormulario, debounce, tag , vista } from '../ui.js';
import { irPara } from '../router.js';
import { abrirEntradaCompra } from './entrada.js';
import { abrirConsumo } from '../consumo.js';
import { dataBR } from '../../core/fmt.js';

let filtro = { termo: '', categoria: '', situacao: '' };

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function html() {
  const e = log.estado();
  const v = valorEstoque(e);
  const baixo = estoqueBaixo(e);
  const categorias = e.config.categoriasProduto || [];

  const variantes = listarVariantes(e).filter((x) => {
    if (filtro.categoria && x.categoria !== filtro.categoria) return false;
    if (filtro.situacao === 'baixo' && x.saldo > (x.estoqueMinimo || 0)) return false;
    if (filtro.situacao === 'zerado' && x.saldo !== 0) return false;
    if (filtro.situacao === 'negativo' && x.saldo >= 0) return false;
    if (filtro.termo && !x.busca.includes(normaliza(filtro.termo))) return false;
    return true;
  });

  // Agrupa por produto para a lista nao virar uma parede de tamanhos.
  const porProduto = new Map();
  for (const x of variantes) {
    if (!porProduto.has(x.produtoId)) porProduto.set(x.produtoId, []);
    porProduto.get(x.produtoId).push(x);
  }

  const temProdutos = Object.keys(e.produtos).length > 0;

  return `
  <div class="grade grade-3 mb">
    ${kpi('Estoque a custo', brl(v.custo), num(v.unidades) + ' peças')}
    ${kpi('Valor de venda', brl(v.venda), 'margem potencial ' + brl(v.margemPotencial))}
    ${kpi('Repor', num(baixo.length), baixo.length ? 'itens no mínimo ou abaixo' : 'nenhum item no limite',
      baixo.length ? '' : '')}
  </div>

  ${comprasHTML(e)}

  ${consumosHTML(e)}

  <div class="barra-botoes mb">
    <button class="btn btn-primario" data-acao="novo-produto">${icone('mais', 16)} Novo produto</button>
    <button class="btn" data-acao="entrada">${icone('baixar', 16)} Entrada de compra</button>
    <button class="btn" data-acao="consumo">${icone('enviar', 16)} Baixa para consumo</button>
    <button class="btn" data-acao="etiquetas">${icone('etiqueta', 16)} Etiquetas</button>
    <button class="btn" data-acao="exportar">${icone('documento', 16)} Exportar</button>
  </div>

  <div class="busca mb">${icone('busca')}
    <input id="busca-estoque" placeholder="Buscar por nome, cor, tamanho, SKU ou código" value="${esc(filtro.termo)}">
  </div>

  <div class="filtros">
    <div class="campo-grupo"><label>Categoria</label>
      <select data-filtro="categoria">
        <option value="">Todas</option>
        ${categorias.map((c) => `<option${filtro.categoria === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="campo-grupo"><label>Situação</label>
      <select data-filtro="situacao">
        <option value="">Todos os itens</option>
        <option value="baixo"${filtro.situacao === 'baixo' ? ' selected' : ''}>No mínimo ou abaixo</option>
        <option value="zerado"${filtro.situacao === 'zerado' ? ' selected' : ''}>Sem estoque</option>
        <option value="negativo"${filtro.situacao === 'negativo' ? ' selected' : ''}>Saldo negativo</option>
      </select>
    </div>
  </div>

  ${!temProdutos
    ? vazio('caixa', 'Nenhum produto cadastrado',
      'Comece cadastrando uma peça com os tamanhos que você tem. Depois dê entrada da compra para o estoque começar a contar.',
      '<button class="btn btn-primario" data-acao="novo-produto">Cadastrar o primeiro produto</button>')
    : porProduto.size === 0
      ? vazio('busca', 'Nada encontrado', 'Nenhum item bate com esse filtro.')
      : `<div class="cartao"><div class="lista">${[...porProduto.entries()].map(([pid, lista]) => cartaoProduto(e, pid, lista)).join('')}</div></div>`}
  `;
}

function cartaoProduto(e, produtoId, variantes) {
  const p = e.produtos[produtoId];
  const total = variantes.reduce((s, v) => s + v.saldo, 0);
  const custo = variantes.reduce((s, v) => s + v.saldo * v.custoMedio, 0);
  const alerta = variantes.some((v) => v.saldo <= (v.estoqueMinimo || 0));
  const grades = variantes.map((v) => {
    const cls = v.saldo < 0 ? 'tag-erro' : v.saldo === 0 ? '' : v.saldo <= (v.estoqueMinimo || 0) ? 'tag-alerta' : 'tag-ok';
    const nome = [v.tamanho, v.cor].filter(Boolean).join('/');
    return `<span class="tag ${cls}">${esc(nome)}: ${v.saldo}</span>`;
  }).join('');

  return `<div class="item" data-produto="${produtoId}">
    <div class="avatar">${icone('caixa', 18)}</div>
    <div class="corpo">
      <div class="titulo">${esc(p.nome)} ${!p.ativo ? tag('arquivado') : ''}</div>
      <div class="sub">${esc(p.categoria || 'Sem categoria')} · ${esc(brl(p.precoVenda))}</div>
      <div class="pilulas" style="margin-top:.35rem">${grades}</div>
    </div>
    <div class="valor">${total} ${alerta ? icone('alerta', 14) : ''}<small>${brl(custo)}</small></div>
  </div>`;
}

/**
 * As compras lancadas e COMO cada uma foi paga.
 *
 * Existe por um motivo so': compra parcelada no cartao lancada como a' vista
 * afunda o mes da compra e deixa os seguintes leves demais. Compra antiga, de
 * antes de existir forma de pagamento, vem marcada "à vista" — e e' justamente
 * a que precisa ser revista. Por isso ela aparece destacada.
 */
function comprasHTML(e) {
  const lista = Object.values(e.compras || {})
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
  if (!lista.length) return '';
  const aRever = lista.filter((c) => !c.pagamentoInformado).length;
  return `<div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer"><h3>Compras e como foram pagas</h3>
        <div class="texto-2 pequeno">${lista.length} compra(s) · valores em R$</div></div>
    </div>
    ${aRever ? `<div class="aviso aviso-alerta">${icone('alerta')}<div>
      <strong>${aRever} compra(s) sem forma de pagamento informada.</strong>
      Elas contam como pagas à vista no dia da entrada. Se alguma foi parcelada no cartão, use
      <strong>Pagamento</strong> na linha dela — o estoque e o custo não mudam, só a data em que o
      dinheiro sai do caixa.</div></div>` : ''}
    <div class="rolagem-x"><table>
      <thead><tr><th>Data</th><th>Nota / fornecedor</th><th class="dir">Peças</th>
        <th class="dir">Valor</th><th>Pagamento</th><th></th></tr></thead>
      <tbody>${lista.map((c) => `<tr>
        <td>${dataBR(c.data)}</td>
        <td>${esc(c.documento || c.obs || '—')}</td>
        <td class="dir num">${c.nItens}</td>
        <td class="dir num">${brl(c.valorTotal)}</td>
        <td>${c.forma === 'credito'
          ? tag(c.parcelas.length + '× no crédito', 'roxo') + `<br><span class="texto-3 pequeno">1ª em ${dataBR(c.parcelas[0].vencimento)}</span>`
          : (c.pagamentoInformado ? 'À vista' : `<span class="texto-3">à vista (não informado)</span>`)}</td>
        <td class="dir"><button class="btn btn-p" data-pagto="${esc(c.id)}">Pagamento</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="dica">Mudar aqui <strong>não mexe no estoque nem no custo da peça</strong>: só redistribui a
      saída no fluxo de caixa. A DRE também não muda — compra vira CMV quando a peça é vendida.</p>
  </div>`;
}

/**
 * As ultimas baixas para consumo. Fica na tela de estoque, e nao escondida num
 * relatorio, porque a pergunta "quem levou aquela peca" aparece justamente
 * quando se olha o saldo e ele nao bate com a arara.
 */
function consumosHTML(e) {
  const lista = Object.values(e.consumos || {})
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id))
    .slice(0, 8);
  if (!lista.length) return '';
  const total = Object.values(e.consumos || {}).reduce((s, c) => s + c.custoTotal, 0);
  return `<div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer"><h3>Saiu sem venda</h3>
        <div class="texto-2 pequeno">${Object.keys(e.consumos).length} baixa(s) · ${brl(total)} a custo, no total</div></div>
    </div>
    <div class="lista">${lista.map((c) => `
      <div class="item" style="cursor:default">
        <div class="avatar">${icone('enviar', 16)}</div>
        <div class="corpo">
          <div class="titulo">${esc(c.destinatario || 'sem destinatário')} ${tag(c.motivo, 'roxo')}</div>
          <div class="sub">${dataBR(c.data)} · ${c.itens.map((i) => `${i.qtd}× ${esc(nomeDaVariante(e, i.varianteId))}`).join(', ')}
            ${c.obs ? ' · ' + esc(c.obs) : ''}</div>
        </div>
        <div class="valor">${brl(c.custoTotal)}<small>a custo</small></div>
      </div>`).join('')}</div>
    <p class="dica">Peça que sai assim não gera cobrança nem receita: o custo dela é descontado do resultado
      do mês, na linha "Consumo, brindes e perdas" da DRE.</p>
  </div>`;
}

/** Rotulo da variante sem depender do produto ainda existir. */
function nomeDaVariante(e, varianteId) {
  const v = e.variantes[varianteId];
  if (!v) return '(item removido)';
  const p = e.produtos[v.produtoId];
  const detalhe = [v.tamanho, v.cor].filter(Boolean).join(' / ');
  return (p ? p.nome : '(produto removido)') + (detalhe ? ' — ' + detalhe : '');
}

function ligar(raiz, redesenhar) {
  const busca = raiz.querySelector('#busca-estoque');
  if (busca) {
    busca.addEventListener('input', debounce((ev) => {
      filtro.termo = ev.target.value;
      redesenhar();
      const b = document.getElementById('busca-estoque');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }, 220));
  }
  liga(raiz, 'change', '[data-filtro]', (ev, el) => { filtro[el.dataset.filtro] = el.value; redesenhar(); });
  liga(raiz, 'click', '[data-produto]', (ev, el) => irPara('/produto/' + el.dataset.produto));
  liga(raiz, 'click', '[data-acao="novo-produto"]', () => abrirNovoProduto());
  liga(raiz, 'click', '[data-acao="entrada"]', () => abrirEntradaCompra());
  liga(raiz, 'click', '[data-acao="consumo"]', () => abrirConsumo());

  liga(raiz, 'click', '[data-pagto]', (ev, el) => {
    const c = log.estado().compras[el.dataset.pagto];
    if (!c) return;
    const m = modalFormulario({
      titulo: 'Como esta compra foi paga',
      valores: {
        forma: c.forma,
        parcelas: c.parcelas.length,
        primeiroVencimento: c.parcelas[0] ? c.parcelas[0].vencimento : c.data,
      },
      campos: [
        { nome: 'forma', rotulo: 'Forma', tipo: 'select',
          opcoes: [{ v: 'avista', t: 'À vista (PIX, dinheiro, débito)' },
            { v: 'credito', t: 'Cartão de crédito parcelado' }] },
        { nome: 'parcelas', rotulo: 'Parcelas', tipo: 'select', meia: true,
          opcoes: Array.from({ length: 12 }, (_, k) => ({ v: String(k + 1), t: (k + 1) + 'x' })) },
        { nome: 'primeiroVencimento', rotulo: '1ª parcela em', tipo: 'data', meia: true,
          dica: 'As seguintes caem de mês em mês, no mesmo dia.' },
      ],
      extras: `<p class="dica"><strong>${esc(c.documento || dataBR(c.data))} · ${brl(c.valorTotal)}.</strong>
        Isto muda só a data em que o dinheiro sai do caixa. Estoque, custo médio e DRE ficam como estão.</p>`,
      aoSalvar: async (d, fechar) => {
        await acoes.editarPagamentoCompra(c.id, {
          forma: d.forma,
          parcelas: Number(d.parcelas) || 1,
          primeiroVencimento: d.forma === 'credito' ? d.primeiroVencimento : null,
        });
        fechar();
        toast('Pagamento da compra atualizado.', 'ok');
      },
    });
    void m;
  });
  liga(raiz, 'click', '[data-acao="etiquetas"]', () => irPara('/etiquetas'));
  liga(raiz, 'click', '[data-acao="exportar"]', () => exportarEstoque());
}

// ---------------- novo produto ----------------

export function abrirNovoProduto(aoCriar) {
  const e = log.estado();
  const tamanhos = e.config.tamanhos || [];

  const campos = [
    { nome: 'nome', rotulo: 'Nome da peça', obrigatorio: true, attrs: 'placeholder="Vestido midi Lia"' },
    { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', meia: true, opcoes: ['', ...(e.config.categoriasProduto || [])] },
    { nome: 'marca', rotulo: 'Marca / fornecedor', meia: true },
    { nome: 'precoVenda', rotulo: 'Preço de venda', tipo: 'moeda', obrigatorio: true, meia: true },
    { nome: 'estoqueMinimo', rotulo: 'Estoque mínimo', tipo: 'inteiro', meia: true, valor: e.config.estoqueMinimoPadrao },
    { nome: 'descricao', rotulo: 'Observações', tipo: 'textarea' },
  ];

  const extras = `
    <h3 class="mt" style="font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--texto-3)">Grade</h3>
    <div class="campo-grupo">
      <label>Tamanhos</label>
      <div class="pilulas" id="grade-tamanhos">
        ${tamanhos.map((t) => `<button type="button" class="pilula" data-tam="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="dica">Toque nos tamanhos que essa peça tem. Cada tamanho vira um saldo separado.</div>
    </div>
    <div class="campo-grupo">
      <label for="cores-input">Cores</label>
      <input id="cores-input" placeholder="Preto, Off white, Verde militar">
      <div class="dica">Separe por vírgula. Deixe vazio se a peça tem só uma cor.</div>
    </div>
    <div class="aviso aviso-info" style="margin-top:.8rem">${icone('info')}
      <div>Cada combinação de tamanho e cor recebe SKU e código de barras próprios, gerados automaticamente.</div>
    </div>`;

  const m = modalFormulario({
    titulo: 'Novo produto',
    campos, extras, textoOk: 'Cadastrar',
    aoSalvar: async (d, fechar, form, raiz) => {
      const tams = [...raiz.querySelectorAll('[data-tam].ativa')].map((b) => b.dataset.tam);
      const cores = (raiz.querySelector('#cores-input').value || '')
        .split(',').map((c) => c.trim()).filter(Boolean);
      const listaTam = tams.length ? tams : ['Único'];
      const listaCor = cores.length ? cores : [''];
      const variantes = [];
      for (const cor of listaCor) for (const t of listaTam) variantes.push({ tamanho: t, cor });
      if (variantes.length > 120) throw new Error('Essa grade gera ' + variantes.length + ' itens. Reduza tamanhos ou cores.');

      const id = await acoes.criarProduto({
        nome: d.nome, categoria: d.categoria, marca: d.marca,
        descricao: d.descricao, precoVenda: d.precoVenda,
        estoqueMinimo: d.estoqueMinimo === null ? e.config.estoqueMinimoPadrao : d.estoqueMinimo,
      }, variantes);
      fechar();
      toast(`Produto cadastrado com ${variantes.length} ${variantes.length === 1 ? 'item' : 'itens'} de grade.`, 'ok');
      if (aoCriar) aoCriar(id);
    },
  });

  liga(m.el, 'click', '[data-tam]', (ev, el) => { ev.preventDefault(); el.classList.toggle('ativa'); });
  return m;
}

// ---------------- exportacao ----------------

async function exportarEstoque() {
  const { paraCSV, csvMoeda, baixarArquivo } = await import('../ui.js');
  const e = log.estado();
  const linhas = listarVariantes(e, { incluirInativas: true }).map((v) => [
    v.produto, v.categoria, v.marca, v.tamanho, v.cor, v.sku, v.codigoBarras,
    v.saldo, csvMoeda(v.custoMedio), csvMoeda(v.saldo * v.custoMedio),
    csvMoeda(v.preco), csvMoeda(v.saldo * v.preco), v.ativo ? 'ativo' : 'arquivado',
  ]);
  const csv = paraCSV(
    ['Produto', 'Categoria', 'Marca', 'Tamanho', 'Cor', 'SKU', 'Código de barras',
      'Saldo', 'Custo médio', 'Total a custo', 'Preço venda', 'Total a venda', 'Situação'],
    linhas
  );
  baixarArquivo('AME Store - estoque.csv', csv, 'text/csv');
  toast('Arquivo gerado.', 'ok');
}
