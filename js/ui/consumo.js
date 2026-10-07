// consumo.js — a janela de dar baixa numa peca que saiu sem venda.
//
// Uso proprio, brinde, peca emprestada para divulgacao, amostra, perda. Antes
// disso o caminho era o ajuste de estoque, que tira a peca e deixa o custo
// evaporar: o saldo caia, ninguem pagava, e a DRE seguia mostrando um lucro que
// nao houve. Aqui a peca sai, o custo fica registrado e a DRE o desconta.
//
// `destinatario` existe para a pergunta que sempre vem depois: quem levou.
import * as log from '../core/eventlog.js';
import * as acoes from '../domain/acoes.js';
import { listarVariantes } from '../domain/consultas.js';
import { brl, brlSimples, esc, iso, normaliza } from '../core/fmt.js';
import { icone } from './icones.js';
import { abrirModal, toast, debounce } from './ui.js';

const MOTIVOS = [
  'Uso próprio',
  'Brinde ou cortesia',
  'Divulgação / influencer',
  'Amostra ou peça de prova',
  'Perda, roubo ou avaria',
  'Outro',
];

/**
 * Abre a janela de baixa para consumo.
 * `aoConcluir()` roda depois de gravado.
 */
export function abrirConsumo({ aoConcluir } = {}) {
  const escolhidos = [];
  let termo = '';

  const m = abrirModal({
    titulo: 'Baixa para consumo',
    largo: true,
    corpo: `
      <div class="aviso aviso-info">${icone('info')}<div>
        A peça <strong>sai do estoque sem gerar cobrança</strong>: nada a receber, nada de receita e nada no
        teto do MEI. O que entra no resultado é o <strong>custo</strong> da peça, no mês em que ela saiu.</div></div>

      <h3>1. O que está saindo</h3>
      <div class="busca">${icone('busca')}
        <input id="cs-busca" placeholder="Buscar peça, SKU ou código de barras" autocomplete="off"></div>
      <div id="cs-sugestoes"></div>
      <div id="cs-itens" class="mb"></div>

      <h3>2. Para quem e por quê</h3>
      <div class="linha">
        <div class="campo-grupo"><label for="cs-dest">Destinatário</label>
          <input id="cs-dest" list="cs-clientes" placeholder="Quem levou a peça">
          <datalist id="cs-clientes">${clientesHTML()}</datalist>
          <div class="dica">Pode ser cliente, você mesma, a loja, uma influencer — nome livre.</div></div>
        <div class="campo-grupo"><label for="cs-motivo">Motivo</label>
          <select id="cs-motivo">${MOTIVOS.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
      </div>
      <div class="linha">
        <div class="campo-grupo"><label for="cs-data">Data</label>
          <input id="cs-data" type="date" value="${iso()}"></div>
        <div class="campo-grupo"><label for="cs-obs">Observação</label>
          <input id="cs-obs" placeholder="opcional" maxlength="120"></div>
      </div>
      <p class="dica" id="cs-resumo"></p>`,
    botoes: [
      { texto: 'Cancelar', acao: (f) => f() },
      {
        texto: 'Dar baixa', classe: 'btn-primario',
        acao: async (fechar, raizModal) => {
          if (!escolhidos.length) { toast('Escolha pelo menos uma peça.', 'erro'); return; }
          const destinatario = raizModal.querySelector('#cs-dest').value.trim();
          if (!destinatario) { toast('Diga quem levou a peça.', 'erro'); return; }
          await acoes.baixarParaConsumo({
            itens: escolhidos.map((i) => ({ varianteId: i.varianteId, qtd: i.qtd })),
            destinatario,
            motivo: raizModal.querySelector('#cs-motivo').value,
            data: raizModal.querySelector('#cs-data').value || iso(),
            obs: raizModal.querySelector('#cs-obs').value.trim(),
          });
          fechar();
          toast('Baixa registrada.', 'ok');
          if (aoConcluir) aoConcluir();
        },
      },
    ],
  });

  const raiz = m.el;
  const $ = (q) => raiz.querySelector(q);

  function clientesHTML() {
    return Object.values(log.estado().clientes).filter((c) => c.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((c) => `<option value="${esc(c.nome)}">`).join('');
  }

  function pintarSugestoes() {
    const alvo = $('#cs-sugestoes');
    const t = normaliza(termo).trim();
    if (!t) { alvo.innerHTML = ''; return; }
    const lista = listarVariantes(log.estado())
      .filter((x) => t.split(/\s+/).every((pedaco) => x.busca.includes(pedaco)))
      .slice(0, 8);
    alvo.innerHTML = lista.length ? `<div class="lista">${lista.map((x) => `
      <div class="item" data-add="${esc(x.id)}">
        <div class="corpo"><div class="titulo">${esc(x.rotulo)}</div>
          <div class="sub">${x.saldo > 0 ? x.saldo + ' em estoque'
            : '<span style="color:var(--vermelho)">sem estoque</span>'} · custo ${brl(x.custoMedio)}</div></div>
        <div class="valor">${brl(x.preco)}</div>
      </div>`).join('')}</div>`
      : '<p class="texto-3 pequeno">Nada encontrado.</p>';
  }

  function pintarItens() {
    const alvo = $('#cs-itens');
    if (!escolhidos.length) { alvo.innerHTML = '<p class="texto-3 pequeno">Nenhuma peça escolhida ainda.</p>'; return; }
    alvo.innerHTML = `<div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir" style="width:70px">Qtd</th>
        <th class="dir">Custo (R$)</th><th></th></tr></thead>
      <tbody>${escolhidos.map((n, idx) => `<tr>
        <td>${esc(n.rotulo)}</td>
        <td class="dir"><input type="number" min="1" value="${n.qtd}" data-qtd="${idx}" style="text-align:right"></td>
        <td class="dir num" data-custo="${idx}">${brlSimples(n.custoUnit * n.qtd)}</td>
        <td class="dir"><button type="button" class="btn btn-p btn-icone btn-fantasma" data-rem="${idx}"
          aria-label="Tirar">${icone('fechar', 14)}</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // O custo total e o aviso de estoque ficam juntos, num lugar que e'
  // redesenhado a cada tecla — assim a quantidade digitada nunca passa
  // despercebida por falta de aviso.
  function pintarResumo() {
    const total = escolhidos.reduce((soma, i) => soma + i.custoUnit * i.qtd, 0);
    const furos = escolhidos.filter((i) => i.qtd > i.saldo);
    const partes = [];
    if (escolhidos.length) {
      partes.push(`Sai do estoque <strong>${escolhidos.reduce((s, i) => s + i.qtd, 0)} peça(s)</strong>,`
        + ` <strong>${brl(total)}</strong> a custo. Esse valor é descontado do resultado do mês,`
        + ` na linha "Consumo, brindes e perdas" da DRE.`);
    }
    if (furos.length) {
      partes.push(`<span style="color:var(--ambar)">Atenção: ${furos.map((i) => esc(i.rotulo)).join(', ')}`
        + ` ${furos.length === 1 ? 'tem' : 'têm'} menos peça em estoque do que está saindo.`
        + ` O saldo vai ficar negativo.</span>`);
    }
    $('#cs-resumo').innerHTML = partes.join(' ');
  }

  $('#cs-busca').addEventListener('input', debounce((ev) => {
    termo = ev.target.value;
    pintarSugestoes();
  }, 200));

  raiz.addEventListener('click', (ev) => {
    const add = ev.target.closest('[data-add]');
    if (add) {
      const x = listarVariantes(log.estado()).find((y) => y.id === add.dataset.add);
      if (x) {
        const existente = escolhidos.find((n) => n.varianteId === x.id);
        if (existente) existente.qtd++;
        else escolhidos.push({ varianteId: x.id, rotulo: x.rotulo, qtd: 1, custoUnit: x.custoMedio, saldo: x.saldo });
        termo = '';
        $('#cs-busca').value = '';
        pintarSugestoes(); pintarItens(); pintarResumo();
      }
      return;
    }
    const rem = ev.target.closest('[data-rem]');
    if (rem) {
      escolhidos.splice(Number(rem.dataset.rem), 1);
      pintarItens(); pintarResumo();
    }
  });

  // Digitar quantidade nao redesenha a tabela: o campo perderia o foco e no
  // celular o teclado fecharia a cada tecla. Atualiza so' a celula do custo.
  raiz.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.qtd === undefined) return;
    const i = Number(el.dataset.qtd);
    escolhidos[i].qtd = Math.max(1, parseInt(el.value, 10) || 1);
    const celula = raiz.querySelector('[data-custo="' + i + '"]');
    if (celula) celula.textContent = brlSimples(escolhidos[i].custoUnit * escolhidos[i].qtd);
    pintarResumo();
  });

  pintarItens();
  pintarResumo();
  return m;
}
