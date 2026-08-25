// Tela de Estoque — catalogo por produto, com as variantes (tamanho/cor) dentro.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { listarVariantes, valorEstoque, estoqueBaixo } from '../../domain/consultas.js';
import { brl, esc, normaliza, num } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, vazio, liga, toast, modalFormulario, debounce, tag , vista } from '../ui.js';
import { irPara } from '../router.js';
import { abrirEntradaCompra } from './entrada.js';

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

  <div class="barra-botoes mb">
    <button class="btn btn-primario" data-acao="novo-produto">${icone('mais', 16)} Novo produto</button>
    <button class="btn" data-acao="entrada">${icone('baixar', 16)} Entrada de compra</button>
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
