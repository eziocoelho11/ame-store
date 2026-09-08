// troca.js — a janela de trocar uma peca por outra.
//
// Troca nao e' devolucao nem venda nova: e' as duas coisas no mesmo ato. A peca
// volta para a arara, outra sai, e o que muda de dinheiro e' so' a diferenca.
// Antes disso existir, o caminho era devolver e vender de novo, o que criava uma
// venda que nunca aconteceu e contava a mesma peca duas vezes no faturamento —
// justamente o numero que decide o teto do MEI.
import * as log from '../core/eventlog.js';
import * as acoes from '../domain/acoes.js';
import { listarVariantes } from '../domain/consultas.js';
import { nomeVariante, operadorasAtivas, taxaPara } from '../core/state.js';
import { brl, esc, iso, normaliza, paraCentavos } from '../core/fmt.js';
import { icone } from './icones.js';
import { abrirModal, toast, debounce } from './ui.js';

const FORMAS = [
  { v: 'dinheiro', t: 'Dinheiro' },
  { v: 'pix', t: 'PIX' },
  { v: 'debito', t: 'Débito' },
  { v: 'credito', t: 'Crédito' },
  { v: 'fiado', t: 'Fiado' },
];
const IMEDIATAS = ['dinheiro', 'pix'];
const CARTAO = ['debito', 'credito'];

/**
 * Abre a janela de troca de uma venda.
 * `aoConcluir()` roda depois de gravado.
 */
export function abrirTroca({ vendaId, aoConcluir }) {
  const e = log.estado();
  const v = e.vendas[vendaId];
  if (!v) { toast('Venda não encontrada.', 'erro'); return null; }
  if (v.status === 'cancelada') { toast('Venda cancelada não aceita troca.', 'erro'); return null; }

  // Quanto de cada peca ainda esta' com a cliente: o que foi vendido menos o
  // que ela ja' devolveu e menos o que ja' trocou. Sem descontar as trocas
  // anteriores, a mesma peca poderia voltar duas vezes e inflar o estoque.
  const jaFora = {};
  for (const dv of v.devolucoes || []) {
    for (const i of dv.itens) jaFora[i.varianteId] = (jaFora[i.varianteId] || 0) + i.qtd;
  }
  for (const t of v.trocas || []) {
    for (const i of t.devolvidos) jaFora[i.varianteId] = (jaFora[i.varianteId] || 0) + i.qtd;
  }

  const linhas = v.itens.map((i) => ({
    varianteId: i.varianteId,
    rotulo: nomeVariante(e, i.varianteId),
    restante: i.qtd - (jaFora[i.varianteId] || 0),
    valorUnit: i.precoUnit - i.descontoUnit,
  })).filter((l) => l.restante > 0);

  if (!linhas.length) { toast('Todas as peças desta venda já voltaram.'); return null; }

  // Estado da janela. `novos` e' o carrinho da troca: o que a cliente leva.
  const novos = [];
  let termo = '';
  let diferencaMexida = false;

  const m = abrirModal({
    titulo: 'Troca da venda #' + v.numero,
    largo: true,
    corpo: `
      <h3 style="margin-top:0">1. O que a cliente está trazendo</h3>
      <div class="rolagem-x"><table>
        <thead><tr><th>Peça</th><th class="dir">Com ela</th>
          <th class="dir">Valor</th><th class="dir" style="width:90px">Devolver</th></tr></thead>
        <tbody>${linhas.map((l, idx) => `<tr>
          <td>${esc(l.rotulo)}</td>
          <td class="dir num">${l.restante}</td>
          <td class="dir num texto-3">${brl(l.valorUnit)}</td>
          <td class="dir"><input type="number" min="0" max="${l.restante}" value="0"
            data-volta="${idx}" style="text-align:right"></td>
        </tr>`).join('')}</tbody>
      </table></div>

      <h3>2. O que ela está levando</h3>
      <div class="busca">${icone('busca')}
        <input id="tr-busca" placeholder="Buscar peça, SKU ou código de barras" autocomplete="off"></div>
      <div id="tr-sugestoes"></div>
      <div id="tr-novos" class="mb"></div>

      <h3>3. A diferença</h3>
      <div id="tr-conta" class="cartao compacto"></div>
      <div class="linha">
        <div class="campo-grupo"><label for="tr-dif">Diferença</label>
          <input id="tr-dif" inputmode="decimal" value="0,00">
          <div class="dica">Positiva: a cliente paga. Negativa: a loja devolve.</div></div>
        <div class="campo-grupo"><label for="tr-forma">Como recebeu a diferença</label>
          <select id="tr-forma">${FORMAS.map((f) => `<option value="${f.v}">${f.t}</option>`).join('')}</select></div>
      </div>
      <div class="campo-grupo" id="tr-maquina-caixa" hidden><label for="tr-maquina">Maquininha</label>
        <select id="tr-maquina">${operadorasAtivas(log.estado().config)
          .map((o) => `<option value="${esc(o.id)}">${esc(o.nome)}</option>`).join('')}</select></div>
      <div class="linha">
        <div class="campo-grupo" id="tr-venc-caixa" hidden><label for="tr-venc">Vencimento da diferença</label>
          <input id="tr-venc" type="date" value="${iso()}"></div>
        <div class="campo-grupo"><label for="tr-data">Data da troca</label>
          <input id="tr-data" type="date" value="${iso()}"></div>
      </div>
      <div class="campo-grupo"><label for="tr-motivo">Motivo</label>
        <select id="tr-motivo">
          <option>Tamanho errado</option><option>Não serviu</option>
          <option>Não gostou da cor</option><option>Defeito</option><option>Outro</option>
        </select></div>
      <label class="checkbox-linha"><input type="checkbox" id="tr-estoque" checked>
        <span>A peça que voltou pode ser revendida</span></label>
      <div class="dica">Desmarque se voltou com defeito: aí ela não entra no estoque.</div>
      <p class="dica" id="tr-aviso"></p>`,
    botoes: [
      { texto: 'Cancelar', acao: (f) => f() },
      {
        texto: 'Registrar troca', classe: 'btn-primario',
        acao: async (fechar, raizModal) => {
          const devolvidos = lerDevolvidos(raizModal);
          if (!devolvidos.length) { toast('Diga qual peça está voltando.', 'erro'); return; }
          if (!novos.length) { toast('Diga qual peça a cliente está levando.', 'erro'); return; }
          const diferenca = paraCentavos(raizModal.querySelector('#tr-dif').value);
          const forma = raizModal.querySelector('#tr-forma').value;
          const data = raizModal.querySelector('#tr-data').value || iso();
          await acoes.trocarVenda(vendaId, devolvidos,
            novos.map((n) => ({ varianteId: n.varianteId, qtd: n.qtd, precoUnit: n.precoUnit })), {
              diferenca,
              formaDiferenca: forma,
              operadoraDiferenca: CARTAO.includes(forma) ? (raizModal.querySelector('#tr-maquina').value || null) : null,
              antecipaDiferenca: CARTAO.includes(forma)
                && taxaPara(log.estado().config, forma, 1, raizModal.querySelector('#tr-maquina').value || '').antecipa === true,
              vencimentoDiferenca: (diferenca > 0 && !IMEDIATAS.includes(forma))
                ? (raizModal.querySelector('#tr-venc').value || data) : null,
              motivo: raizModal.querySelector('#tr-motivo').value,
              retornaEstoque: raizModal.querySelector('#tr-estoque').checked,
              data,
            });
          fechar();
          toast('Troca registrada.', 'ok');
          if (aoConcluir) aoConcluir();
        },
      },
    ],
  });

  const raiz = m.el;
  const $ = (q) => raiz.querySelector(q);

  function lerDevolvidos(r) {
    const saida = [];
    r.querySelectorAll('[data-volta]').forEach((inp) => {
      const qtd = parseInt(inp.value, 10) || 0;
      if (qtd > 0) saida.push({ varianteId: linhas[Number(inp.dataset.volta)].varianteId, qtd });
    });
    return saida;
  }

  const valorQueVolta = () => lerDevolvidos(raiz).reduce((soma, it) => {
    const l = linhas.find((x) => x.varianteId === it.varianteId);
    return soma + (l ? l.valorUnit * it.qtd : 0);
  }, 0);

  const valorQueSai = () => novos.reduce((soma, n) => soma + n.precoUnit * n.qtd, 0);

  function pintarSugestoes() {
    const alvo = $('#tr-sugestoes');
    const t = normaliza(termo).trim();
    if (!t) { alvo.innerHTML = ''; return; }
    const lista = listarVariantes(log.estado())
      .filter((x) => t.split(/\s+/).every((pedaco) => x.busca.includes(pedaco)))
      .slice(0, 8);
    alvo.innerHTML = lista.length ? `<div class="lista">${lista.map((x) => `
      <div class="item" data-add="${esc(x.id)}">
        <div class="corpo"><div class="titulo">${esc(x.rotulo)}</div>
          <div class="sub">${x.saldo > 0 ? x.saldo + ' em estoque'
            : '<span style="color:var(--vermelho)">sem estoque</span>'} · ${esc(x.sku)}</div></div>
        <div class="valor">${brl(x.preco)}</div>
      </div>`).join('')}</div>`
      : '<p class="texto-3 pequeno">Nada encontrado.</p>';
  }

  function pintarNovos() {
    const alvo = $('#tr-novos');
    if (!novos.length) { alvo.innerHTML = '<p class="texto-3 pequeno">Nenhuma peça escolhida ainda.</p>'; return; }
    alvo.innerHTML = `<div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir" style="width:70px">Qtd</th>
        <th class="dir" style="width:110px">Preço</th><th class="dir">Total</th><th></th></tr></thead>
      <tbody>${novos.map((n, idx) => `<tr>
        <td>${esc(n.rotulo)}</td>
        <td class="dir"><input type="number" min="1" value="${n.qtd}" data-nqtd="${idx}" style="text-align:right"></td>
        <td class="dir"><input inputmode="decimal" value="${(n.precoUnit / 100).toFixed(2).replace('.', ',')}"
          data-npreco="${idx}" style="text-align:right"></td>
        <td class="dir num" data-ntotal="${idx}">${brl(n.precoUnit * n.qtd)}</td>
        <td class="dir"><button type="button" class="btn btn-p btn-icone btn-fantasma" data-nrem="${idx}"
          aria-label="Tirar da troca">${icone('fechar', 14)}</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // So' a celula do total, para nao redesenhar a tabela debaixo do dedo.
  function pintarTotalDaLinha(idx) {
    const n = novos[idx];
    const celula = raiz.querySelector('[data-ntotal="' + idx + '"]');
    if (n && celula) celula.textContent = brl(n.precoUnit * n.qtd);
  }

  /**
   * A conta e a diferenca sugerida. Enquanto a dona nao digitar um valor
   * proprio, a diferenca acompanha as duas listas; depois que ela digitar, o
   * valor dela manda — arredondar troca e' decisao de quem esta' no balcao.
   */
  function pintarConta() {
    const volta = valorQueVolta();
    const sai = valorQueSai();
    const sugerida = sai - volta;
    if (!diferencaMexida) $('#tr-dif').value = (sugerida / 100).toFixed(2).replace('.', ',');
    const dif = paraCentavos($('#tr-dif').value);

    $('#tr-conta').innerHTML = `
      <div class="flex entre pequeno"><span class="texto-2">Peça que volta</span>
        <span class="num">${brl(volta)}</span></div>
      <div class="flex entre pequeno"><span class="texto-2">Peça que sai</span>
        <span class="num">${brl(sai)}</span></div>
      <div class="flex entre"><strong>Diferença pela conta</strong>
        <strong class="num">${brl(sugerida)}</strong></div>`;

    const forma = $('#tr-forma').value;
    const maquinas = operadorasAtivas(log.estado().config);
    const noCartao = CARTAO.includes(forma) && maquinas.length > 0;
    $('#tr-maquina-caixa').hidden = !noCartao;
    // Cartao antecipado cai de uma vez: nao tem vencimento para escolher.
    const antecipa = noCartao
      && taxaPara(log.estado().config, forma, 1, $('#tr-maquina').value || '').antecipa === true;
    $('#tr-venc-caixa').hidden = !(dif > 0 && !IMEDIATAS.includes(forma) && !antecipa);
    $('#tr-aviso').innerHTML = avisoHTML(dif, forma, sugerida);
  }

  function avisoHTML(dif, forma, sugerida) {
    const partes = [];
    // Estoque estourado e' aviso, nao impedimento: a peca pode estar na arara e
    // faltando no sistema, e travar a troca no balcao seria pior.
    const furos = novos.filter((n) => n.qtd > n.saldo);
    if (furos.length) {
      partes.push(`<span style="color:var(--ambar)">Atenção: ${furos.map((n) => esc(n.rotulo)).join(', ')}
        ${furos.length === 1 ? 'tem' : 'têm'} menos peça em estoque do que a troca está tirando.
        O saldo vai ficar negativo.</span>`);
    }
    if (dif !== sugerida) partes.push(`Você mudou a diferença: a conta dava ${brl(sugerida)}.`);
    if (dif > 0) {
      const maquinas = operadorasAtivas(log.estado().config);
      const regra = CARTAO.includes(forma) && maquinas.length
        ? taxaPara(log.estado().config, forma, 1, $('#tr-maquina').value || '') : null;
      if (regra && regra.antecipa) {
        const taxa = Math.round((dif * (regra.taxaPct || 0)) / 100);
        partes.push(`Antecipado${regra.operadoraNome ? ' pela ' + esc(regra.operadoraNome) : ''}:
          entram <strong>${brl(dif - taxa)}</strong>${(regra.prazoDias || 0) === 0 ? ' no caixa de hoje'
            : ' em ' + regra.prazoDias + ' dia(s)'}, já sem a taxa de ${brl(taxa)}.`);
      } else {
        partes.push(IMEDIATAS.includes(forma)
          ? `A cliente paga <strong>${brl(dif)}</strong>, que entra no caixa na data da troca.`
          : `<strong>${brl(dif)}</strong> ficam <strong>a receber</strong> e aparecem em Financeiro.`);
      }
    } else if (dif < 0) {
      partes.push(`<span class="negativo">A loja devolve ${brl(-dif)}.</span> Isso reduz a receita do mês da
        troca. O dinheiro que sai não entra sozinho no fluxo de caixa — é o mesmo comportamento da devolução.`);
    } else {
      partes.push('Troca sem diferença: o faturamento não muda, só as peças mudam de lugar.');
    }
    partes.push('Só a diferença vira receita: a peça devolvida já foi faturada no mês da venda.');
    return partes.join(' ');
  }

  $('#tr-busca').addEventListener('input', debounce((ev) => {
    termo = ev.target.value;
    pintarSugestoes();
  }, 200));

  raiz.addEventListener('click', (ev) => {
    const add = ev.target.closest('[data-add]');
    if (add) {
      const x = listarVariantes(log.estado()).find((y) => y.id === add.dataset.add);
      if (x) {
        const existente = novos.find((n) => n.varianteId === x.id);
        if (existente) existente.qtd++;
        else novos.push({ varianteId: x.id, rotulo: x.rotulo, qtd: 1, precoUnit: x.preco, saldo: x.saldo });
        termo = '';
        $('#tr-busca').value = '';
        pintarSugestoes(); pintarNovos(); pintarConta();
      }
      return;
    }
    const rem = ev.target.closest('[data-nrem]');
    if (rem) {
      novos.splice(Number(rem.dataset.nrem), 1);
      pintarNovos(); pintarConta();
    }
  });

  raiz.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.nqtd !== undefined) {
      novos[Number(el.dataset.nqtd)].qtd = Math.max(1, parseInt(el.value, 10) || 1);
      pintarTotalDaLinha(Number(el.dataset.nqtd));
      pintarConta();
    } else if (el.dataset.npreco !== undefined) {
      novos[Number(el.dataset.npreco)].precoUnit = paraCentavos(el.value);
      pintarTotalDaLinha(Number(el.dataset.npreco));
      pintarConta();
    } else if (el.dataset.volta !== undefined) {
      pintarConta();
    } else if (el.id === 'tr-dif') {
      diferencaMexida = true;
      pintarConta();
    }
  });

  raiz.addEventListener('change', (ev) => {
    if (ev.target.id === 'tr-forma' || ev.target.id === 'tr-maquina') pintarConta();
  });

  pintarNovos();
  pintarConta();
  return m;
}
