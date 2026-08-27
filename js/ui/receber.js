// receber.js — a janela de receber uma parcela, inteira ou em parte.
//
// Existe porque fiado quase nunca e' pago redondo: a cliente traz metade hoje e
// o resto na semana que vem. Antes o app so' sabia dizer "recebido" ou "nao
// recebido", e a diferenca ficava na cabeca da dona.
//
// Usada em tres telas (Financeiro, detalhe da venda e ficha da cliente), entao
// mora fora delas.
import * as acoes from '../domain/acoes.js';
import { saldoDe } from '../domain/consultas.js';
import { brl, esc, iso, dataBR, paraCentavos } from '../core/fmt.js';
import { abrirModal, toast } from './ui.js';

const FORMAS = [
  { v: 'dinheiro', t: 'Dinheiro' },
  { v: 'pix', t: 'PIX' },
  { v: 'debito', t: 'Débito' },
  { v: 'credito', t: 'Crédito' },
  { v: 'transferencia', t: 'Transferência' },
];

/**
 * Abre a janela de recebimento de uma parcela.
 * `aoConcluir(resultado)` recebe {completou, valor} depois de gravado.
 */
export function abrirRecebimento({ recebivel, nomeCliente = '', aoConcluir }) {
  const r = recebivel;
  const falta = saldoDe(r);
  const jaPago = r.pago || 0;

  const m = abrirModal({
    titulo: 'Receber parcela',
    corpo: `
      <div class="kpi destaque mb">
        <div class="rotulo-kpi">Falta receber</div>
        <div class="valor-kpi">${brl(falta)}</div>
        <div class="nota-kpi">parcela de ${brl(r.liquido)}${jaPago ? ` · já pagos ${brl(jaPago)}` : ''}
          · vence ${dataBR(r.vencimento)}${nomeCliente ? ' · ' + esc(nomeCliente) : ''}</div>
      </div>

      ${jaPago ? `<div class="lista mb">
        ${(r.pagamentos || []).map((p) => `<div class="item" style="cursor:default">
          <div class="corpo"><div class="titulo">${dataBR(p.data)}</div>
            <div class="sub">${esc(p.forma || 'sem forma anotada')}</div></div>
          <div class="valor">${brl(p.valor)}</div></div>`).join('')}
      </div>` : ''}

      <form data-form>
        <div class="linha">
          <div class="campo-grupo"><label for="rec-valor">Valor recebido</label>
            <input id="rec-valor" inputmode="decimal" value="${(falta / 100).toFixed(2).replace('.', ',')}"></div>
          <div class="campo-grupo"><label for="rec-data">Data</label>
            <input id="rec-data" type="date" value="${iso()}"></div>
        </div>
        <div class="campo-grupo"><label for="rec-forma">Como recebeu</label>
          <select id="rec-forma">${FORMAS.map((f) => `<option value="${f.v}">${f.t}</option>`).join('')}</select></div>
      </form>

      <div class="barra-botoes mt">
        <button type="button" class="btn btn-p" data-atalho="metade">Metade</button>
        <button type="button" class="btn btn-p" data-atalho="tudo">Tudo</button>
      </div>
      <p class="dica" id="rec-aviso"></p>`,
    botoes: [
      { texto: 'Cancelar', acao: (f) => f() },
      {
        texto: 'Registrar', classe: 'btn-primario',
        acao: async (fechar, raiz) => {
          const valor = paraCentavos(raiz.querySelector('#rec-valor').value);
          const data = raiz.querySelector('#rec-data').value || iso();
          const forma = raiz.querySelector('#rec-forma').value;
          if (valor <= 0) { toast('Informe quanto foi recebido.', 'erro'); return; }
          if (valor > falta) { toast(`A parcela só deve ${brl(falta)}.`, 'erro'); return; }
          const completou = valor >= falta;
          if (completou) await acoes.baixarRecebivel(r.id, forma, data);
          else await acoes.abaterRecebivel(r.id, valor, { forma, data });
          toast(completou ? 'Parcela quitada.' : `Recebido ${brl(valor)}. Falta ${brl(falta - valor)}.`, 'ok');
          fechar();
          if (aoConcluir) aoConcluir({ completou, valor });
        },
      },
    ],
  });

  const raiz = m.el;
  const campo = raiz.querySelector('#rec-valor');
  const aviso = raiz.querySelector('#rec-aviso');
  const atualizarAviso = () => {
    const v = paraCentavos(campo.value);
    if (v <= 0) { aviso.textContent = ''; return; }
    if (v > falta) { aviso.innerHTML = `<span class="negativo">Acima do que a parcela deve (${brl(falta)}).</span>`; return; }
    aviso.innerHTML = v >= falta
      ? 'Quita a parcela.'
      : `Fica faltando <strong>${brl(falta - v)}</strong>, e a parcela continua em aberto.`;
  };
  campo.addEventListener('input', atualizarAviso);
  raiz.querySelector('[data-atalho="metade"]').addEventListener('click', () => {
    campo.value = (Math.round(falta / 2) / 100).toFixed(2).replace('.', ',');
    atualizarAviso();
  });
  raiz.querySelector('[data-atalho="tudo"]').addEventListener('click', () => {
    campo.value = (falta / 100).toFixed(2).replace('.', ',');
    atualizarAviso();
  });
  atualizarAviso();
  return m;
}
