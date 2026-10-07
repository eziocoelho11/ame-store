// pagamento.js — como o cliente paga. Aqui nasce a agenda de recebiveis:
// credito em 3x nao e' caixa hoje, e o app precisa saber disso.
import * as log from '../../core/eventlog.js';
import { taxaPara, operadorasAtivas } from '../../core/state.js';
import { brl, esc, iso, somaDias, somaMesesData, paraCentavos, dataBR, dividirCentavos, aplicaPct } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { abrirModal, toast, liga , vista } from '../ui.js';

const FORMAS = [
  { id: 'dinheiro', nome: 'Dinheiro' },
  { id: 'pix', nome: 'PIX' },
  { id: 'debito', nome: 'Débito' },
  { id: 'credito', nome: 'Crédito' },
  { id: 'fiado', nome: 'A prazo' },
];

export function abrirPagamento({ total, clienteId, avisoEstoque, aoConfirmar }) {
  const e = log.estado();
  const linhas = [];

  const falta = () => total - linhas.reduce((s, l) => s + l.valor, 0);

  const m = abrirModal({
    titulo: 'Pagamento',
    corpo: `
      ${avisoEstoque ? `<div class="aviso aviso-alerta">${icone('alerta')}<div>${esc(avisoEstoque)}</div></div>` : ''}
      <div class="kpi destaque mb"><div class="rotulo-kpi">Total a pagar</div>
        <div class="valor-kpi">${brl(total)}</div>
        <div class="nota-kpi" id="p-falta"></div></div>
      <div class="pilulas mb">
        ${FORMAS.map((f) => `<button type="button" class="pilula" data-forma="${f.id}">${esc(f.nome)}</button>`).join('')}
      </div>
      <div id="p-linhas"></div>
      <div id="p-resumo" class="mt"></div>`,
    botoes: [
      { texto: 'Voltar', acao: (f) => f() },
      {
        texto: 'Confirmar venda', classe: 'btn-primario',
        acao: async (fechar) => {
          if (!linhas.length) { toast('Escolha a forma de pagamento.', 'erro'); return; }
          if (falta() !== 0) {
            toast(falta() > 0 ? `Faltam ${brl(falta())}.` : `Sobrando ${brl(-falta())}.`, 'erro');
            return;
          }
          const fiadoSemCliente = linhas.some((l) => l.forma === 'fiado') && !clienteId;
          if (fiadoSemCliente) { toast('Venda a prazo precisa de um cliente selecionado na venda.', 'erro'); return; }
          const btn = m.el.querySelectorAll('.modal-rodape .btn')[1];
          if (btn) btn.disabled = true;
          try {
            await aoConfirmar(linhas.map((l) => {
              // A antecipacao vai gravada no evento, e nao lida da config no
              // replay: se um dia a operadora deixar de antecipar, as vendas de
              // hoje continuam contando do jeito que aconteceram.
              const regra = taxaPara(e.config, l.forma, l.parcelas || 1, l.operadoraId || '');
              const cartao = l.forma === 'credito' || l.forma === 'debito';
              return {
              forma: l.forma, valor: l.valor,
              parcelas: (l.forma === 'credito' || l.forma === 'fiado') ? l.parcelas : 1,
              bandeira: l.bandeira || '',
              operadoraId: cartao ? (l.operadoraId || null) : null,
              operadora: cartao ? (regra.operadoraNome || '') : '',
              antecipa: cartao ? regra.antecipa === true : false,
              vencimento: l.forma === 'fiado' ? l.vencimento : undefined,
              vencimentos: l.forma === 'fiado' ? (l.vencimentos || []).slice(0, Math.max(1, l.parcelas || 1)) : undefined,
              };
            }));
            fechar();
          } catch (err) {
            if (btn) btn.disabled = false;
            toast(err.message || 'Não consegui registrar a venda.', 'erro');
          }
        },
      },
    ],
  });

  const raiz = m.el;
  const elLinhas = raiz.querySelector('#p-linhas');
  const elFalta = raiz.querySelector('#p-falta');
  const elResumo = raiz.querySelector('#p-resumo');

  function desenhar() {
    const f = falta();
    elFalta.innerHTML = f === 0
      ? '<span class="positivo">Tudo alocado</span>'
      : f > 0 ? `Falta alocar <strong>${brl(f)}</strong>` : `<span class="negativo">Sobrando ${brl(-f)}</span>`;

    elLinhas.innerHTML = linhas.length ? linhas.map((l, i) => linhaHTML(l, i)).join('') : '';
    elResumo.innerHTML = linhas.length ? resumoHTML() : '';
  }

  function linhaHTML(l, i) {
    const nome = (FORMAS.find((f) => f.id === l.forma) || {}).nome || l.forma;
    const regra = taxaPara(e.config, l.forma, l.parcelas || 1, l.operadoraId || '');
    const taxa = aplicaPct(l.valor, regra.taxaPct || 0);
    const maquinas = operadorasAtivas(e.config);
    const cartao = l.forma === 'debito' || l.forma === 'credito';
    return `<div class="cartao compacto">
      <div class="flex entre centro">
        <strong>${esc(nome)}</strong>
        <button class="btn btn-icone btn-p btn-fantasma" data-remover="${i}" aria-label="Remover">${icone('fechar', 14)}</button>
      </div>
      <div class="linha mt">
        <div class="campo-grupo"><label>Valor</label>
          <input inputmode="decimal" data-valor="${i}" value="${(l.valor / 100).toFixed(2).replace('.', ',')}"></div>
        ${l.forma === 'credito' || l.forma === 'fiado' ? `<div class="campo-grupo"><label>Parcelas</label>
          <select data-parcelas="${i}">${Array.from({ length: 12 }, (_, k) => k + 1).map((n) =>
            `<option value="${n}"${l.parcelas === n ? ' selected' : ''}>${n}x</option>`).join('')}</select></div>` : ''}
        ${l.forma === 'fiado' && (l.parcelas || 1) === 1 ? `<div class="campo-grupo"><label>Vencimento</label>
          <input type="date" data-vencimento="${i}" value="${esc(l.vencimento)}"></div>` : ''}
        ${cartao && maquinas.length ? `<div class="campo-grupo"><label>Maquininha</label>
          <select data-operadora="${i}">
            ${maquinas.map((o) => `<option value="${esc(o.id)}"${l.operadoraId === o.id ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}
          </select></div>` : ''}
        ${cartao ? `<div class="campo-grupo"><label>Bandeira</label>
          <input data-bandeira="${i}" value="${esc(l.bandeira || '')}" placeholder="opcional"></div>` : ''}
      </div>
      ${cartao ? `<div class="dica">${dicaCartaoHTML(l, regra, taxa, maquinas)}</div>` : ''}
      ${l.forma === 'fiado' && (l.parcelas || 1) > 1 ? agendaEditavelHTML(l, i) : ''}
      ${l.forma === 'fiado' ? `<div class="dica">${agendaFiadoHTML(l)}</div>` : ''}
    </div>`;
  }

  /**
   * O que a maquininha faz com esse valor, em uma frase. Com antecipacao a
   * conta e' outra: entra tudo de uma vez, e a taxa e' a da quantidade de
   * parcelas que a cliente escolheu — 3x custa mais caro que 1x, mesmo caindo
   * junto. Sem dizer isso na tela, a dona nao entende por que a taxa subiu.
   */
  function dicaCartaoHTML(l, regra, taxa, maquinas) {
    const n = Math.max(1, l.parcelas || 1);
    const pctTexto = (regra.taxaPct || 0).toString().replace('.', ',');
    const liquido = l.valor - taxa;
    const partes = [];
    if (!maquinas.length) {
      partes.push('<strong>Nenhuma maquininha cadastrada</strong> — cadastre em Ajustes › Maquininhas'
        + ' para o app saber a taxa e se a operadora antecipa.');
    }
    if (regra.antecipa) {
      const quando = (regra.prazoDias || 0) === 0
        ? 'cai <strong>hoje</strong>'
        : `cai em ${dataBR(somaDias(iso(), regra.prazoDias))} (${regra.prazoDias} dia(s))`;
      partes.push(`Antecipado${regra.operadoraNome ? ' pela ' + esc(regra.operadoraNome) : ''}:`
        + ` ${quando} <strong>${brl(liquido)}</strong> de uma vez`
        + `${n > 1 ? `, mesmo a cliente pagando em ${n}×` : ''}.`);
      partes.push(`Taxa de ${n}× = ${pctTexto}% = ${brl(taxa)}.`);
    } else {
      partes.push(`Taxa ${pctTexto}% = ${brl(taxa)} · líquido ${brl(liquido)}`
        + ` · primeira parcela em ${dataBR(somaDias(iso(), regra.prazoDias || 30))}.`);
    }
    if (!regra.taxaPct) {
      partes.push('<strong>Taxa não configurada</strong> — ajuste em Ajustes › Taxas da maquininha.');
    }
    return partes.join(' ');
  }

  /**
   * Uma caixa de data por parcela. O padrao e' o mesmo dia dos meses seguintes,
   * e cada uma pode ser mudada a mao: fiado de verdade se combina no balcao
   * ("essa eu pago no dia 5, a outra quando receber").
   */
  function agendaEditavelHTML(l, i) {
    const n = Math.max(1, l.parcelas || 1);
    const valores = dividirCentavos(l.valor, n);
    const vencs = l.vencimentos || [];
    const base = l.vencimento || somaDias(iso(), 30);
    return `<div class="agenda-parcelas">
      ${Array.from({ length: n }, (_, k) => `
        <div class="campo-grupo">
          <label for="venc-${i}-${k}">${k + 1}ª · ${brl(valores[k])}</label>
          <input id="venc-${i}-${k}" type="date" data-venc-parcela="${i}-${k}"
            value="${esc(vencs[k] || somaMesesData(base, k))}">
        </div>`).join('')}
    </div>`;
  }

  /**
   * Mostra na hora da venda como o fiado vai cair no caixa. Fiado nao tem taxa:
   * o que muda com a parcela e' QUANDO o dinheiro entra, nao quanto entra.
   */
  function agendaFiadoHTML(l) {
    const n = Math.max(1, l.parcelas || 1);
    const base = l.vencimento || somaDias(iso(), 30);
    const valores = dividirCentavos(l.valor, n);
    if (n === 1) return `Entra no caixa em ${dataBR(base)}. Sem taxa.`;
    // Le' a agenda de verdade, inclusive as datas que o usuario mudou a mao.
    const vencs = l.vencimentos || [];
    const venc = (i) => dataBR(vencs[i] || somaMesesData(base, i));
    // O resto da divisao vai para as primeiras parcelas — podem ser varias,
    // entao o texto tem que dizer quantas, ou o numero na tela nao bate.
    const maior = valores[0], menor = valores[n - 1];
    const nMaior = valores.filter((v) => v === maior).length;
    const resumo = maior === menor
      ? `${n}× de ${brl(maior)}`
      : `${n}× — ${nMaior === 1 ? 'a 1ª' : `as ${nMaior} primeiras`} de ${brl(maior)}`
        + ` e ${n - nMaior === 1 ? 'a última' : 'as demais'} de ${brl(menor)}`;
    const datas = n <= 4
      ? valores.map((v, i) => venc(i)).join(' · ')
      : `${venc(0)} · ${venc(1)} · … · ${venc(n - 1)}`;
    return `${resumo}. Sem taxa.<br>Vencimentos: ${datas} — cada data acima pode ser mudada.`;
  }

  function resumoHTML() {
    let bruto = 0, taxas = 0, hoje = 0, depois = 0;
    for (const l of linhas) {
      const regra = taxaPara(e.config, l.forma, l.parcelas || 1, l.operadoraId || '');
      const taxa = aplicaPct(l.valor, regra.taxaPct || 0);
      const cartao = l.forma === 'credito' || l.forma === 'debito';
      bruto += l.valor; taxas += taxa;
      // Cartao antecipado com prazo zero e' caixa de hoje: contar como "a
      // receber" mostraria a dona esperando um dinheiro que ja' entrou.
      if (l.forma === 'dinheiro' || l.forma === 'pix') hoje += l.valor;
      else if (cartao && regra.antecipa && (regra.prazoDias || 0) === 0) hoje += l.valor - taxa;
      else depois += l.valor - taxa;
    }
    return `<div class="cartao compacto">
      <div class="flex entre pequeno"><span class="texto-2">Recebido hoje</span><span class="num negrito">${brl(hoje)}</span></div>
      <div class="flex entre pequeno"><span class="texto-2">A receber</span><span class="num">${brl(depois)}</span></div>
      ${taxas ? `<div class="flex entre pequeno"><span class="texto-2">Taxas</span><span class="num negativo">− ${brl(taxas)}</span></div>` : ''}
      <hr style="margin:.5rem 0">
      <div class="flex entre"><span class="negrito">Líquido da venda</span><span class="num negrito">${brl(bruto - taxas)}</span></div>
    </div>`;
  }

  liga(raiz, 'click', '[data-forma]', (ev, el) => {
    ev.preventDefault();
    const forma = el.dataset.forma;
    const restante = falta();
    if (restante <= 0 && linhas.length) { toast('O total já está coberto.'); return; }
    const primeiro = forma === 'fiado' ? somaDias(iso(), 30) : '';
    const maquinas = operadorasAtivas(e.config);
    linhas.push({
      forma,
      valor: Math.max(0, restante),
      operadoraId: (forma === 'credito' || forma === 'debito') && maquinas.length ? maquinas[0].id : '',
      parcelas: 1,
      bandeira: '',
      vencimento: primeiro,
      vencimentos: primeiro ? [primeiro] : [],
    });
    desenhar();
  });

  liga(raiz, 'click', '[data-remover]', (ev, el) => { linhas.splice(Number(el.dataset.remover), 1); desenhar(); });

  liga(raiz, 'change', '[data-valor]', (ev, el) => {
    const i = Number(el.dataset.valor);
    const informado = paraCentavos(el.value);
    const outros = linhas.reduce((s, l, k) => s + (k === i ? 0 : l.valor), 0);
    const maximo = total - outros;
    // Dinheiro a mais nao vira receita: vira troco.
    if (linhas[i].forma === 'dinheiro' && informado > maximo) {
      linhas[i].valor = maximo;
      toast('Troco: ' + brl(informado - maximo));
    } else {
      linhas[i].valor = informado;
    }
    desenhar();
  });
  /**
   * Refaz a agenda a partir da primeira data: mesmo dia nos meses seguintes.
   * Datas que o usuario ja' mexeu a mao sao preservadas quando ainda cabem no
   * numero de parcelas — mudar de 3x para 4x nao pode apagar o que ele ajustou.
   */
  function refazerVencimentos(l, { forcarTudo = false } = {}) {
    const n = Math.max(1, l.parcelas || 1);
    const base = l.vencimento || somaDias(iso(), 30);
    const antigos = forcarTudo ? [] : (l.vencimentos || []);
    l.vencimentos = Array.from({ length: n }, (_, k) => (k === 0 ? base : (antigos[k] || somaMesesData(base, k))));
  }

  liga(raiz, 'change', '[data-parcelas]', (ev, el) => {
    const i = Number(el.dataset.parcelas);
    linhas[i].parcelas = Number(el.value);
    if (linhas[i].forma === 'fiado') refazerVencimentos(linhas[i]);
    desenhar();
  });

  // Data de UMA parcela: mexe so' nela. Mexer na primeira reagenda as seguintes
  // que ainda nao foram tocadas a mao.
  liga(raiz, 'change', '[data-venc-parcela]', (ev, el) => {
    const [i, k] = el.dataset.vencParcela.split('-').map(Number);
    const l = linhas[i];
    l.vencimentos = l.vencimentos || [];
    l.vencimentos[k] = el.value;
    if (k === 0) { l.vencimento = el.value; refazerVencimentos(l, { forcarTudo: true }); }
    desenhar();
  });
  liga(raiz, 'change', '[data-bandeira]', (ev, el) => { linhas[Number(el.dataset.bandeira)].bandeira = el.value; });
  liga(raiz, 'change', '[data-operadora]', (ev, el) => {
    linhas[Number(el.dataset.operadora)].operadoraId = el.value;
    desenhar();
  });
  liga(raiz, 'change', '[data-vencimento]', (ev, el) => {
    const i = Number(el.dataset.vencimento);
    linhas[i].vencimento = el.value || somaDias(iso(), 30);
    desenhar();
  });

  desenhar();
  return m;
}

/** Simula as parcelas de um valor no credito — usado na tela de financeiro. */
export function simularParcelas(config, valor, parcelas) {
  const regra = taxaPara(config, 'credito', parcelas);
  return dividirCentavos(valor, parcelas).map((v, i) => ({
    parcela: i + 1,
    bruto: v,
    taxa: aplicaPct(v, regra.taxaPct || 0),
    liquido: v - aplicaPct(v, regra.taxaPct || 0),
    vencimento: somaDias(iso(), (regra.prazoDias || 30) * (i + 1)),
  }));
}
