// entrada.js — modal de entrada de compra (o que chega do fornecedor).
// O frete da compra e' rateado no custo das pecas, nao lancado como despesa:
// senao a margem do produto sai maquiada para cima.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { listarVariantes } from '../../domain/consultas.js';
import { brl, esc, iso, normaliza, paraCentavos } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { abrirModal, toast, liga, debounce , vista } from '../ui.js';

export function abrirEntradaCompra(varianteInicial) {
  const e = log.estado();
  const disponiveis = listarVariantes(e, { incluirInativas: false });
  if (!disponiveis.length) {
    toast('Cadastre um produto antes de dar entrada.', 'erro');
    return;
  }

  const itens = [];
  if (varianteInicial) {
    const v = disponiveis.find((x) => x.id === varianteInicial);
    if (v) itens.push({ varianteId: v.id, rotulo: v.rotulo, qtd: 1, custoUnit: v.custoMedio || v.ultimoCusto || 0 });
  }

  const corpo = `
    <div class="linha">
      <div class="campo-grupo"><label for="e-data">Data</label>
        <input id="e-data" type="date" value="${iso()}"></div>
      <div class="campo-grupo"><label for="e-doc">Nota / pedido</label>
        <input id="e-doc" placeholder="NF 1234"></div>
    </div>
    <div class="linha">
      <div class="campo-grupo"><label for="e-forn">Fornecedor</label>
        <input id="e-forn" placeholder="Nome do fornecedor"></div>
      <div class="campo-grupo"><label for="e-frete">Frete da compra</label>
        <input id="e-frete" inputmode="decimal" placeholder="0,00">
        <div class="dica">Rateado no custo das peças.</div></div>
    </div>

    <div class="busca mt">${icone('busca')}
      <input id="e-busca" placeholder="Buscar peça para adicionar (nome, tamanho, SKU)" autocomplete="off">
    </div>
    <div id="e-sugestoes"></div>

    <div id="e-itens" class="mt"></div>
    <div id="e-total" class="mt"></div>`;

  const m = abrirModal({
    titulo: 'Entrada de compra',
    largo: true,
    corpo,
    botoes: [
      { texto: 'Cancelar', acao: (f) => f() },
      {
        texto: 'Lançar entrada', classe: 'btn-primario',
        acao: async (fechar, raiz) => {
          const validos = itens.filter((i) => i.qtd > 0);
          if (!validos.length) { toast('Adicione pelo menos uma peça.', 'erro'); return; }
          const semCusto = validos.filter((i) => !i.custoUnit);
          if (semCusto.length) {
            toast('Informe o custo de cada peça — é ele que calcula sua margem.', 'erro');
            return;
          }
          await acoes.darEntrada({
            data: raiz.querySelector('#e-data').value || iso(),
            documento: raiz.querySelector('#e-doc').value,
            fornecedorId: null,
            obs: raiz.querySelector('#e-forn').value,
            freteTotal: paraCentavos(raiz.querySelector('#e-frete').value),
            itens: validos.map((i) => ({ varianteId: i.varianteId, qtd: i.qtd, custoUnit: i.custoUnit })),
          });
          fechar();
          const pecas = validos.reduce((s, i) => s + i.qtd, 0);
          toast(`Entrada lançada: ${pecas} ${pecas === 1 ? 'peça' : 'peças'}.`, 'ok');
        },
      },
    ],
  });

  const raiz = m.el;
  const elItens = raiz.querySelector('#e-itens');
  const elSug = raiz.querySelector('#e-sugestoes');
  const elTotal = raiz.querySelector('#e-total');

  function desenharItens() {
    if (!itens.length) {
      elItens.innerHTML = '<p class="texto-3 pequeno">Nenhuma peça adicionada ainda.</p>';
      elTotal.innerHTML = '';
      return;
    }
    elItens.innerHTML = `<div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir" style="width:76px">Qtd</th>
      <th class="dir" style="width:110px">Custo un.</th><th class="dir">Total</th><th style="width:36px"></th></tr></thead>
      <tbody>${itens.map((i, idx) => `<tr>
        <td>${esc(i.rotulo)}</td>
        <td class="dir"><input type="number" min="1" step="1" value="${i.qtd}" data-campo="qtd" data-idx="${idx}" style="text-align:right"></td>
        <td class="dir"><input inputmode="decimal" value="${(i.custoUnit / 100).toFixed(2).replace('.', ',')}" data-campo="custo" data-idx="${idx}" style="text-align:right"></td>
        <td class="dir num">${brl(i.qtd * i.custoUnit)}</td>
        <td><button class="btn btn-icone btn-fantasma" data-remover="${idx}" aria-label="Remover">${icone('fechar', 15)}</button></td>
      </tr>`).join('')}</tbody></table></div>`;

    const total = itens.reduce((s, i) => s + i.qtd * i.custoUnit, 0);
    const frete = paraCentavos(raiz.querySelector('#e-frete').value);
    const pecas = itens.reduce((s, i) => s + i.qtd, 0);
    elTotal.innerHTML = `<div class="kpi destaque">
      <div class="rotulo-kpi">Total da compra</div>
      <div class="valor-kpi">${brl(total + frete)}</div>
      <div class="nota-kpi">${pecas} peças · mercadoria ${brl(total)}${frete ? ' + frete ' + brl(frete) : ''}</div></div>`;
  }

  function desenharSugestoes(termo) {
    const t = normaliza(termo).trim();
    if (!t) { elSug.innerHTML = ''; return; }
    const achados = disponiveis
      .filter((v) => t.split(/\s+/).every((p) => v.busca.includes(p)))
      .filter((v) => !itens.some((i) => i.varianteId === v.id))
      .slice(0, 8);
    elSug.innerHTML = achados.length
      ? `<div class="lista">${achados.map((v) => `<div class="item" data-add="${v.id}">
          <div class="corpo"><div class="titulo">${esc(v.rotulo)}</div>
          <div class="sub">saldo ${v.saldo} · último custo ${brl(v.ultimoCusto || v.custoMedio)}</div></div>
          <div class="valor">${icone('mais', 18)}</div></div>`).join('')}</div>`
      : '<p class="texto-3 pequeno">Nada encontrado.</p>';
  }

  raiz.querySelector('#e-busca').addEventListener('input', debounce((ev) => desenharSugestoes(ev.target.value), 160));
  raiz.querySelector('#e-frete').addEventListener('input', debounce(desenharItens, 300));

  liga(raiz, 'click', '[data-add]', (ev, el) => {
    const v = disponiveis.find((x) => x.id === el.dataset.add);
    if (!v) return;
    itens.push({ varianteId: v.id, rotulo: v.rotulo, qtd: 1, custoUnit: v.ultimoCusto || v.custoMedio || 0 });
    raiz.querySelector('#e-busca').value = '';
    elSug.innerHTML = '';
    desenharItens();
  });
  liga(raiz, 'click', '[data-remover]', (ev, el) => { itens.splice(Number(el.dataset.remover), 1); desenharItens(); });
  liga(raiz, 'change', '[data-campo]', (ev, el) => {
    const i = itens[Number(el.dataset.idx)];
    if (!i) return;
    if (el.dataset.campo === 'qtd') i.qtd = Math.max(0, parseInt(el.value, 10) || 0);
    else i.custoUnit = paraCentavos(el.value);
    desenharItens();
  });

  desenharItens();
  return m;
}
