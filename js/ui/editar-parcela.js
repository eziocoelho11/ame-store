// editar-parcela.js — a janela de corrigir data e valor de uma parcela em aberto.
//
// Fiado se renegocia na porta da loja: "passa pro dia 10", "deixa 150 que eu
// fecho". Antes disso existir, a unica saida era estornar e lancar de novo, o
// que jogava fora o historico do que ja' tinha sido pago.
//
// Usada em quatro telas (Financeiro › A receber, Financeiro › Devedores, ficha
// da cliente e detalhe da venda), entao mora fora delas.
import * as acoes from '../domain/acoes.js';
import { rotuloRecebivel } from '../domain/consultas.js';
import { brl, esc, dataBR, paraCentavos, aplicaPct } from '../core/fmt.js';
import { abrirModal, toast } from './ui.js';

/**
 * Abre a janela de edicao de uma parcela em aberto.
 * `aoConcluir()` roda depois de gravado.
 */
export function abrirEdicaoParcela({ recebivel, nomeCliente = '', aoConcluir }) {
  const r = recebivel;
  if (r.status === 'recebido' || r.status === 'cancelado') {
    toast('Só dá para editar parcela em aberto. Estorne antes.', 'erro');
    return null;
  }
  const jaPago = r.pago || 0;
  const temTaxa = (r.taxaPct || 0) > 0;

  const m = abrirModal({
    titulo: 'Editar parcela',
    corpo: `
      <div class="kpi mb">
        <div class="rotulo-kpi">${esc(rotuloRecebivel(r))}</div>
        <div class="valor-kpi">${brl(r.liquido)}</div>
        <div class="nota-kpi">vence ${dataBR(r.vencimento)}${nomeCliente ? ' · ' + esc(nomeCliente) : ''}
          ${jaPago ? ` · já pagos ${brl(jaPago)}` : ''}</div>
      </div>

      <form data-form>
        <div class="linha">
          <div class="campo-grupo"><label for="ed-venc">Novo vencimento</label>
            <input id="ed-venc" type="date" value="${esc(r.vencimento)}"></div>
          <div class="campo-grupo"><label for="ed-valor">Valor da parcela${temTaxa ? ' (bruto)' : ''}</label>
            <input id="ed-valor" inputmode="decimal" value="${(r.bruto / 100).toFixed(2).replace('.', ',')}"></div>
        </div>
        <div class="campo-grupo"><label for="ed-motivo">Motivo (opcional)</label>
          <input id="ed-motivo" placeholder="Ex.: renegociado com a cliente" maxlength="120"></div>
      </form>

      <p class="dica" id="ed-aviso"></p>
      ${r.vendaId ? `<p class="dica">Mudar o valor muda o que a cliente ainda deve e o que entra no caixa.
        A receita da venda #${esc(String(r.numeroVenda))} continua a mesma na DRE — abatimento dado depois
        da venda é desconto concedido, não venda menor.</p>` : ''}`,
    botoes: [
      { texto: 'Cancelar', acao: (f) => f() },
      {
        texto: 'Salvar', classe: 'btn-primario',
        acao: async (fechar, raiz) => {
          const vencimento = raiz.querySelector('#ed-venc').value;
          const bruto = paraCentavos(raiz.querySelector('#ed-valor').value);
          const motivo = raiz.querySelector('#ed-motivo').value.trim();
          if (!vencimento) { toast('Informe o vencimento.', 'erro'); return; }
          if (bruto <= 0) { toast('O valor tem de ser maior que zero.', 'erro'); return; }
          if (vencimento === r.vencimento && bruto === r.bruto) { fechar(); return; }
          await acoes.editarRecebivel(r.id, { vencimento, bruto }, motivo);
          toast('Parcela atualizada.', 'ok');
          fechar();
          if (aoConcluir) aoConcluir();
        },
      },
    ],
  });

  // Aviso que acompanha a digitacao: o valor digitado e' o bruto, e o que
  // interessa a quem cobra e' quanto ainda falta depois da taxa e do que ja'
  // entrou. Mostrar so' na hora de salvar seria tarde.
  const raiz = m.el;
  const campoValor = raiz.querySelector('#ed-valor');
  const aviso = raiz.querySelector('#ed-aviso');
  const atualizarAviso = () => {
    const bruto = paraCentavos(campoValor.value);
    if (bruto <= 0) { aviso.innerHTML = '<span class="negativo">Informe um valor maior que zero.</span>'; return; }
    const taxa = aplicaPct(bruto, r.taxaPct || 0);
    const liquido = bruto - taxa;
    const partes = [];
    if (temTaxa) partes.push(`Líquido ${brl(liquido)} (taxa de ${String(r.taxaPct).replace('.', ',')}% = ${brl(taxa)}).`);
    if (jaPago && liquido <= jaPago) {
      partes.push(`<span class="negativo">Já entraram ${brl(jaPago)}: com esse valor a parcela fica quitada.</span>`);
    } else {
      const falta = liquido - jaPago;
      partes.push(jaPago
        ? `Já pagos ${brl(jaPago)}, fica faltando <strong>${brl(falta)}</strong>.`
        : `Fica faltando <strong>${brl(falta)}</strong>.`);
    }
    aviso.innerHTML = partes.join(' ');
  };
  campoValor.addEventListener('input', atualizarAviso);
  atualizarAviso();
  return m;
}
