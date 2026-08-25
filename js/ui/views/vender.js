// vender.js — o balcao. Precisa ser rapido: buscar, tocar, cobrar.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { listarVariantes, porCodigoDeBarras } from '../../domain/consultas.js';
import { brl, esc, normaliza, paraCentavos } from '../../core/fmt.js';
import { precoDaVariante } from '../../core/state.js';
import { icone } from '../icones.js';
import { toast, liga, debounce, vazio , vista } from '../ui.js';
import { abrirPagamento } from './pagamento.js';
import { lerCodigoDeBarras } from '../barras.js';

// O carrinho vive no modulo: trocar de tela e voltar nao perde a venda em andamento.
let carrinho = [];
let canal = 'loja';
let clienteId = '';
let descontoGeral = 0;
let freteCobrado = 0;
let termo = '';

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function totais() {
  const bruto = carrinho.reduce((s, i) => s + i.precoUnit * i.qtd, 0);
  const descItens = carrinho.reduce((s, i) => s + i.descontoUnit * i.qtd, 0);
  const total = Math.max(0, bruto - descItens - descontoGeral + freteCobrado);
  const custo = carrinho.reduce((s, i) => s + i.custoUnit * i.qtd, 0);
  return { bruto, descItens, total, custo, margem: total > 0 ? ((total - custo) / total) * 100 : null,
    pecas: carrinho.reduce((s, i) => s + i.qtd, 0) };
}

function html() {
  const e = log.estado();
  const t = totais();
  const canais = e.config.canais || [];
  const clientes = Object.values(e.clientes).filter((c) => c.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const temProduto = Object.keys(e.variantes).length > 0;

  if (!temProduto) {
    return vazio('caixa', 'Sem produtos cadastrados',
      'O PDV precisa de peças no catálogo para vender. Cadastre em Estoque.',
      '<a class="btn btn-primario" href="#/estoque">Ir para o estoque</a>');
  }

  return `
  <div class="busca mb">${icone('busca')}
    <input id="v-busca" placeholder="Buscar peça, SKU ou código de barras" autocomplete="off" value="${esc(termo)}">
  </div>
  <div class="barra-botoes mb">
    <button class="btn" data-acao="camera">${icone('camera', 16)} Ler código</button>
    <select id="v-canal" style="width:auto;flex:1;min-width:150px">
      ${canais.map((c) => `<option value="${esc(c.id)}"${canal === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
    </select>
  </div>

  <div id="v-sugestoes">${sugestoes()}</div>

  <div class="cartao">
    <div class="cartao-cabecalho"><h3>Carrinho</h3>
      ${carrinho.length ? `<button class="btn btn-p btn-fantasma" data-acao="limpar">Limpar</button>` : ''}</div>
    ${carrinho.length ? itensHTML() : '<p class="texto-3 pequeno">Toque numa peça acima para começar.</p>'}
  </div>

  ${carrinho.length ? `
  <div class="cartao">
    <div class="linha">
      <div class="campo-grupo"><label for="v-cliente">Cliente (opcional)</label>
        <select id="v-cliente">
          <option value="">Sem cadastro</option>
          ${clientes.map((c) => `<option value="${esc(c.id)}"${clienteId === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select></div>
      <div class="campo-grupo"><label for="v-desconto">Desconto na venda</label>
        <input id="v-desconto" inputmode="decimal" value="${descontoGeral ? (descontoGeral / 100).toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div>
    </div>
    <div class="campo-grupo"><label for="v-frete">Frete cobrado do cliente</label>
      <input id="v-frete" inputmode="decimal" value="${freteCobrado ? (freteCobrado / 100).toFixed(2).replace('.', ',') : ''}" placeholder="0,00">
      <div class="dica">Só para venda com envio. Entra como receita.</div></div>
  </div>

  <div class="cartao">
    <div class="flex entre"><span class="texto-2">Peças</span><span class="num">${t.pecas}</span></div>
    <div class="flex entre"><span class="texto-2">Subtotal</span><span class="num">${brl(t.bruto)}</span></div>
    ${t.descItens || descontoGeral ? `<div class="flex entre"><span class="texto-2">Descontos</span><span class="num negativo">− ${brl(t.descItens + descontoGeral)}</span></div>` : ''}
    ${freteCobrado ? `<div class="flex entre"><span class="texto-2">Frete</span><span class="num">${brl(freteCobrado)}</span></div>` : ''}
    <hr>
    <div class="flex entre" style="font-size:1.3rem;font-weight:700">
      <span>Total</span><span class="num">${brl(t.total)}</span></div>
    <div class="pequeno texto-2 mt">Custo ${brl(t.custo)} · margem ${t.margem === null ? '—' : t.margem.toFixed(1).replace('.', ',') + '%'}</div>
    <button class="btn btn-primario btn-g btn-bloco mt" data-acao="cobrar">${icone('dinheiro', 18)} Cobrar ${brl(t.total)}</button>
  </div>` : ''}
  `;
}

function sugestoes() {
  const e = log.estado();
  const t = normaliza(termo).trim();
  if (!t) return '';
  const lista = listarVariantes(e).filter((v) => t.split(/\s+/).every((p) => v.busca.includes(p))).slice(0, 10);
  if (!lista.length) return '<div class="cartao compacto"><p class="texto-3 pequeno mb0">Nada encontrado.</p></div>';
  return `<div class="cartao"><div class="lista">${lista.map((v) => `
    <div class="item" data-add="${v.id}">
      <div class="corpo"><div class="titulo">${esc(v.rotulo)}</div>
        <div class="sub">${v.saldo > 0 ? v.saldo + ' em estoque' : '<span style="color:var(--vermelho)">sem estoque</span>'} · ${esc(v.sku)}</div></div>
      <div class="valor">${brl(v.preco)}</div>
    </div>`).join('')}</div></div>`;
}

function itensHTML() {
  return `<div class="lista">${carrinho.map((i, idx) => `
    <div class="item" style="cursor:default">
      <div class="corpo">
        <div class="titulo">${esc(i.rotulo)}</div>
        <div class="sub">${brl(i.precoUnit)}${i.descontoUnit ? ` <span class="negativo">− ${brl(i.descontoUnit)}</span>` : ''}
          ${i.qtd > i.saldo ? ' · <span style="color:var(--ambar)">acima do estoque</span>' : ''}</div>
      </div>
      <div class="flex centro gap">
        <button class="btn btn-icone btn-p" data-menos="${idx}" aria-label="Menos">${icone('menos', 14)}</button>
        <span class="num negrito" style="min-width:1.4rem;text-align:center">${i.qtd}</span>
        <button class="btn btn-icone btn-p" data-mais="${idx}" aria-label="Mais">${icone('mais', 14)}</button>
      </div>
      <div class="valor" style="min-width:82px">${brl((i.precoUnit - i.descontoUnit) * i.qtd)}
        <small><button class="btn btn-p btn-fantasma" data-editar-item="${idx}">ajustar</button></small></div>
    </div>`).join('')}</div>`;
}

function adicionar(varianteId, redesenhar) {
  const e = log.estado();
  const v = e.variantes[varianteId];
  if (!v) return;
  const existente = carrinho.find((i) => i.varianteId === varianteId);
  if (existente) existente.qtd++;
  else {
    const p = e.produtos[v.produtoId];
    carrinho.push({
      varianteId, qtd: 1,
      rotulo: (p ? p.nome : '') + ' — ' + [v.tamanho, v.cor].filter(Boolean).join('/'),
      precoUnit: precoDaVariante(e, varianteId),
      descontoUnit: 0,
      custoUnit: v.custoMedio,
      saldo: v.saldo,
    });
  }
  termo = '';
  redesenhar();
  const busca = document.getElementById('v-busca');
  if (busca && window.matchMedia('(min-width: 900px)').matches) busca.focus();
}

function limpar() {
  carrinho = []; descontoGeral = 0; freteCobrado = 0; clienteId = ''; termo = '';
}

function ligar(raiz, redesenhar) {
  const busca = raiz.querySelector('#v-busca');
  if (busca) {
    busca.addEventListener('input', debounce((ev) => {
      termo = ev.target.value;
      raiz.querySelector('#v-sugestoes').innerHTML = sugestoes();
    }, 150));
    // Leitor de codigo de barras USB se comporta como teclado: digita e da Enter.
    busca.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const codigo = busca.value.trim();
      const achado = porCodigoDeBarras(log.estado(), codigo);
      if (achado) { adicionar(achado.id, redesenhar); return; }
      const primeira = raiz.querySelector('#v-sugestoes [data-add]');
      if (primeira) adicionar(primeira.dataset.add, redesenhar);
      else toast('Não encontrei essa peça.', 'erro');
    });
  }

  liga(raiz, 'click', '[data-add]', (ev, el) => adicionar(el.dataset.add, redesenhar));
  liga(raiz, 'click', '[data-mais]', (ev, el) => { carrinho[Number(el.dataset.mais)].qtd++; redesenhar(); });
  liga(raiz, 'click', '[data-menos]', (ev, el) => {
    const i = Number(el.dataset.menos);
    carrinho[i].qtd--;
    if (carrinho[i].qtd <= 0) carrinho.splice(i, 1);
    redesenhar();
  });
  liga(raiz, 'click', '[data-acao="limpar"]', () => { limpar(); redesenhar(); });

  liga(raiz, 'click', '[data-editar-item]', async (ev, el) => {
    const idx = Number(el.dataset.editarItem);
    const item = carrinho[idx];
    const { modalFormulario } = await import('../ui.js');
    modalFormulario({
      titulo: item.rotulo,
      campos: [
        { nome: 'qtd', rotulo: 'Quantidade', tipo: 'inteiro', valor: item.qtd, obrigatorio: true, meia: true },
        { nome: 'precoUnit', rotulo: 'Preço unitário', tipo: 'moeda', valor: item.precoUnit, meia: true },
        { nome: 'descontoUnit', rotulo: 'Desconto por peça', tipo: 'moeda', valor: item.descontoUnit },
      ],
      aoSalvar: (d, fechar) => {
        if (d.qtd <= 0) carrinho.splice(idx, 1);
        else Object.assign(item, { qtd: d.qtd, precoUnit: d.precoUnit, descontoUnit: d.descontoUnit });
        fechar(); redesenhar();
      },
    });
  });

  const cli = raiz.querySelector('#v-cliente');
  if (cli) cli.addEventListener('change', (ev) => { clienteId = ev.target.value; });
  const can = raiz.querySelector('#v-canal');
  if (can) can.addEventListener('change', (ev) => { canal = ev.target.value; redesenhar(); });
  const desc = raiz.querySelector('#v-desconto');
  if (desc) desc.addEventListener('change', (ev) => { descontoGeral = paraCentavos(ev.target.value); redesenhar(); });
  const frete = raiz.querySelector('#v-frete');
  if (frete) frete.addEventListener('change', (ev) => { freteCobrado = paraCentavos(ev.target.value); redesenhar(); });

  liga(raiz, 'click', '[data-acao="camera"]', async () => {
    try {
      const codigo = await lerCodigoDeBarras();
      if (!codigo) return;
      const achado = porCodigoDeBarras(log.estado(), codigo);
      if (achado) adicionar(achado.id, redesenhar);
      else toast('Código ' + codigo + ' não está cadastrado.', 'erro');
    } catch (err) {
      toast(err.message || 'Não consegui abrir a câmera.', 'erro');
    }
  });

  liga(raiz, 'click', '[data-acao="cobrar"]', () => {
    const t = totais();
    if (!carrinho.length || t.total <= 0) { toast('Carrinho vazio.', 'erro'); return; }
    const semEstoque = carrinho.filter((i) => i.qtd > i.saldo);

    abrirPagamento({
      total: t.total,
      clienteId,
      avisoEstoque: semEstoque.length
        ? `${semEstoque.length} ${semEstoque.length === 1 ? 'peça está' : 'peças estão'} sendo vendida(s) acima do saldo. O estoque vai ficar negativo — corrija depois em Estoque.`
        : '',
      aoConfirmar: async (pagamentos) => {
        await acoes.registrarVenda({
          itens: carrinho.map((i) => ({
            varianteId: i.varianteId, qtd: i.qtd, precoUnit: i.precoUnit, descontoUnit: i.descontoUnit,
          })),
          pagamentos, canal, clienteId: clienteId || null,
          descontoGeral, freteCobrado,
        });
        const numero = log.estado().contadores.venda;
        limpar();
        redesenhar();
        toast(`Venda #${numero} registrada.`, 'ok');
      },
    });
  });
}
