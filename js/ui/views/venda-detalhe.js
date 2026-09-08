// venda-detalhe.js — o comprovante interno: itens, pagamento, recebiveis,
// devolucao e cancelamento.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { nomeVariante } from '../../core/state.js';
import { rotuloRecebivel, saldoDe } from '../../domain/consultas.js';
import { brl, esc, dataBR, pct, iso } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, confirmar, tag, abrirModal , vista } from '../ui.js';
import { abrirRecebimento } from '../receber.js';
import { abrirEdicaoParcela } from '../editar-parcela.js';
import { abrirTroca } from '../troca.js';
import { comprovanteVenda, imprimirFolha } from '../impressao.js';

export async function render(raiz, params) {
  const desenhar = vista(raiz, () => html(params.id), (caixa) => ligar(caixa, params.id));
  return log.assinar(desenhar);
}

function html(vendaId) {
  const e = log.estado();
  const v = e.vendas[vendaId];
  if (!v) return '<div class="aviso aviso-erro">Venda não encontrada.</div>';

  const cliente = v.clienteId ? e.clientes[v.clienteId] : null;
  const recebiveis = Object.values(e.recebiveis).filter((r) => r.vendaId === vendaId)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  // Com troca, a venda nao vale mais o que valia: soma a diferenca e troca o
  // custo da peca que voltou pelo da que saiu.
  const trocas = v.trocas || [];
  const difTrocas = v.totais.trocaDiferenca || 0;
  const taxaTrocas = trocas.reduce((soma, t) => soma + (t.taxaDiferenca || 0), 0);
  const cmvTrocas = v.totais.trocaCmvDelta || 0;
  const total = v.totais.liquido + difTrocas;
  const liquido = total - v.totais.taxas - taxaTrocas - v.totais.comissaoCanal;
  const cmv = v.totais.cmv + cmvTrocas;
  const margem = liquido - cmv;

  const nomesForma = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado' };

  return `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer">
        <h2>Venda #${v.numero}
          ${v.status === 'cancelada' ? tag('cancelada', 'erro') : ''}
          ${v.status === 'devolvida' ? tag('devolvida', 'erro') : ''}
          ${v.status === 'parcial' ? tag('devolução parcial', 'alerta') : ''}
          ${trocas.length ? tag(trocas.length === 1 ? 'trocada' : trocas.length + ' trocas', 'info') : ''}</h2>
        <div class="texto-2 pequeno">${dataBR(v.data)}${v.hora ? ' às ' + v.hora : ''} · ${esc(v.canalNome)}
          ${cliente ? ' · ' + esc(cliente.nome) : ''}</div>
      </div>
    </div>
    <div class="grade grade-4">
      ${kpi('Total', brl(total), difTrocas ? `venda ${brl(v.totais.liquido)} · troca ${difTrocas > 0 ? '+' : '−'} ${brl(Math.abs(difTrocas))}` : '')}
      ${kpi('Líquido', brl(liquido), 'após taxas e comissões')}
      ${kpi('CMV', brl(cmv), cmvTrocas ? 'já com a troca' : '')}
      ${kpi('Margem', brl(margem), pct(total > 0 ? (margem / total) * 100 : null))}
    </div>
  </div>

  <div class="cartao">
    <h3>Itens</h3>
    <div class="rolagem-x"><table>
      <thead><tr><th>Peça</th><th class="dir">Qtd</th><th class="dir">Preço</th>
        <th class="dir">Desc.</th><th class="dir">Total</th><th class="dir">Custo</th></tr></thead>
      <tbody>${v.itens.map((i) => `<tr>
        <td>${esc(nomeVariante(e, i.varianteId))}</td>
        <td class="dir num">${i.qtd}</td>
        <td class="dir num">${brl(i.precoUnit)}</td>
        <td class="dir num">${i.descontoUnit ? '− ' + brl(i.descontoUnit) : '—'}</td>
        <td class="dir num">${brl(i.bruto - i.desconto)}</td>
        <td class="dir num texto-3">${brl(i.custo)}</td></tr>`).join('')}</tbody>
      <tfoot>
        ${v.descontoGeral ? `<tr><td colspan="4">Desconto na venda</td><td class="dir num">− ${brl(v.descontoGeral)}</td><td></td></tr>` : ''}
        ${v.freteCobrado ? `<tr><td colspan="4">Frete cobrado</td><td class="dir num">${brl(v.freteCobrado)}</td><td></td></tr>` : ''}
        <tr><td colspan="4">Total</td><td class="dir num">${brl(v.totais.liquido)}</td><td></td></tr>
      </tfoot>
    </table></div>
    ${v.obs ? `<p class="dica mt">${esc(v.obs)}</p>` : ''}
  </div>

  <div class="cartao">
    <h3>Pagamento e recebimento</h3>
    <div class="rolagem-x"><table>
      <thead><tr><th>Forma</th><th>Vencimento</th><th class="dir">Bruto</th>
        <th class="dir">Taxa</th><th class="dir">Líquido</th><th>Situação</th><th></th></tr></thead>
      <tbody>${recebiveis.map((r) => `<tr>
        <td>${esc(nomesForma[r.tipo] || r.tipo)}${r.totalParcelas > 1 ? ` ${r.parcela}/${r.totalParcelas}` : ''}
          ${r.bandeira ? `<br><span class="texto-3 pequeno">${esc(r.bandeira)}</span>` : ''}</td>
        <td>${dataBR(r.vencimento)}</td>
        <td class="dir num">${brl(r.bruto)}</td>
        <td class="dir num">${r.taxa ? '− ' + brl(r.taxa) : '—'}</td>
        <td class="dir num">${brl(r.liquido)}
          ${r.status === 'parcial' ? `<br><span class="pequeno texto-3">pagos ${brl(r.pago)} · falta ${brl(saldoDe(r))}</span>` : ''}</td>
        <td>${r.status === 'recebido' ? tag('recebido ' + dataBR(r.recebidoEm), 'ok')
          : r.status === 'cancelado' ? tag('cancelado', 'erro')
          : r.status === 'parcial' ? tag('parcial', 'alerta')
          : r.vencimento < iso() ? tag('vencido', 'erro') : tag('a receber', 'alerta')}</td>
        <td class="dir">${(r.status === 'aberto' || r.status === 'parcial')
          ? `<div class="acoes-celula">
              <button class="btn btn-p btn-icone btn-fantasma" data-editar="${esc(r.id)}"
                title="Editar data e valor" aria-label="Editar parcela">${icone('editar', 16)}</button>
              <button class="btn btn-p" data-receber="${esc(r.id)}">Receber</button></div>`
          : r.status === 'recebido' ? `<button class="btn btn-p btn-fantasma" data-estornar="${esc(r.id)}">Estornar</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="dica">Taxa de cartão e comissão de canal já entram como dedução da receita na DRE.</p>
  </div>

  ${trocas.length ? `<div class="cartao">
    <h3>Trocas</h3>
    ${trocas.map((t) => `<div class="item" style="cursor:default;align-items:flex-start">
      <div class="corpo">
        <div class="titulo">${dataBR(t.data)} — ${esc(t.motivo || 'sem motivo informado')}</div>
        <div class="sub">
          Voltou: ${t.devolvidos.map((i) => `${i.qtd}× ${esc(nomeVariante(e, i.varianteId))}`).join(', ')}
            (${brl(t.valorDevolvido)})${t.retornaEstoque ? '' : ' · não voltou ao estoque'}<br>
          Levou: ${t.novos.map((i) => `${i.qtd}× ${esc(nomeVariante(e, i.varianteId))}`).join(', ')}
            (${brl(t.valorNovo)})
        </div>
      </div>
      <div class="valor ${t.diferenca < 0 ? 'negativo' : ''}">
        ${t.diferenca > 0 ? '+ ' : t.diferenca < 0 ? '− ' : ''}${brl(Math.abs(t.diferenca))}
        <small>${t.diferenca > 0 ? 'a cliente pagou' : t.diferenca < 0 ? 'a loja devolveu' : 'sem diferença'}</small></div>
    </div>`).join('')}
    <p class="dica">Só a diferença entra como receita, no mês da troca. A peça devolvida já tinha sido
      faturada no mês da venda — faturar a peça nova inteira contaria a mesma venda duas vezes.</p>
  </div>` : ''}

  ${v.devolucoes.length ? `<div class="cartao">
    <h3>Devoluções</h3>
    ${v.devolucoes.map((d) => `<div class="item" style="cursor:default">
      <div class="corpo"><div class="titulo">${dataBR(d.data)} — ${esc(d.motivo || 'sem motivo informado')}</div>
        <div class="sub">${d.itens.map((i) => `${i.qtd}× ${esc(nomeVariante(e, i.varianteId))}`).join(', ')}
          ${d.retornaEstoque ? '· voltou ao estoque' : '· não voltou ao estoque'}</div></div>
      <div class="valor negativo">− ${brl(d.valor)}</div></div>`).join('')}
  </div>` : ''}

  ${v.status !== 'cancelada' ? `<div class="barra-botoes nao-imprimir">
    <button class="btn" data-acao="devolver">${icone('sincronizar', 16)} Registrar devolução</button>
    <button class="btn" data-acao="trocar">${icone('etiqueta', 16)} Registrar troca</button>
    <button class="btn btn-perigo" data-acao="cancelar">${icone('fechar', 16)} Cancelar venda</button>
    <button class="btn btn-primario" data-acao="comprovante">${icone('documento', 16)} Comprovante em PDF</button>
  </div>` : `<div class="aviso aviso-erro">${icone('alerta')}<div>
    <strong>Venda cancelada em ${dataBR(v.canceladaEm)}.</strong>${esc(v.motivoCancelamento || '')}
    O estoque foi devolvido e os recebíveis, cancelados.</div></div>`}`;
}

function ligar(raiz, vendaId) {
  const e = log.estado();
  const v = e.vendas[vendaId];
  if (!v) return;

  liga(raiz, 'click', '[data-acao="comprovante"]', () => {
    imprimirFolha(comprovanteVenda(log.estado(), log.estado().vendas[vendaId]));
  });

  liga(raiz, 'click', '[data-receber]', (ev, el) => {
    const r = e.recebiveis[el.dataset.receber];
    const c = v.clienteId ? e.clientes[v.clienteId] : null;
    if (r) abrirRecebimento({ recebivel: r, nomeCliente: c ? c.nome : '' });
  });
  liga(raiz, 'click', '[data-editar]', (ev, el) => {
    const atual = log.estado();
    const r = atual.recebiveis[el.dataset.editar];
    const c = v.clienteId ? atual.clientes[v.clienteId] : null;
    if (r) abrirEdicaoParcela({ recebivel: r, nomeCliente: c ? c.nome : '' });
  });
  liga(raiz, 'click', '[data-estornar]', async (ev, el) => {
    const ok = await confirmar('Estornar recebimento', 'A parcela volta para "a receber".', { textoOk: 'Estornar' });
    if (ok) { await acoes.estornarRecebivel(el.dataset.estornar); toast('Recebimento estornado.'); }
  });

  liga(raiz, 'click', '[data-acao="cancelar"]', async () => {
    const ok = await confirmar('Cancelar venda #' + v.numero,
      (v.trocas || []).length
        ? 'As peças voltam ao estoque, as trocas são desfeitas (a peça nova volta e a devolvida sai), os recebíveis em aberto são cancelados e a venda sai da DRE. A venda continua no histórico, marcada como cancelada.'
        : 'As peças voltam ao estoque, os recebíveis em aberto são cancelados e a venda sai da DRE. A venda continua no histórico, marcada como cancelada.',
      { textoOk: 'Cancelar venda', perigo: true });
    if (!ok) return;
    await acoes.cancelarVenda(vendaId, '');
    toast('Venda cancelada.');
  });

  liga(raiz, 'click', '[data-acao="trocar"]', () => abrirTroca({ vendaId }));

  liga(raiz, 'click', '[data-acao="devolver"]', () => {
    // Quantidade ja' devolvida por item, para nao aceitar devolucao a mais.
    const devolvido = {};
    for (const d of v.devolucoes) for (const i of d.itens) devolvido[i.varianteId] = (devolvido[i.varianteId] || 0) + i.qtd;
    // Peca que saiu numa troca tambem ja' voltou: sem contar aqui, a mesma peca
    // poderia ser devolvida de novo e entrar duas vezes no estoque.
    for (const t of v.trocas || []) for (const i of t.devolvidos) devolvido[i.varianteId] = (devolvido[i.varianteId] || 0) + i.qtd;

    const linhas = v.itens.map((i) => {
      const restante = i.qtd - (devolvido[i.varianteId] || 0);
      return { varianteId: i.varianteId, rotulo: nomeVariante(e, i.varianteId), restante, valorUnit: i.precoUnit - i.descontoUnit };
    }).filter((l) => l.restante > 0);

    if (!linhas.length) { toast('Todos os itens desta venda já foram devolvidos.'); return; }

    const m = abrirModal({
      titulo: 'Devolução da venda #' + v.numero,
      corpo: `
        <div class="rolagem-x"><table>
          <thead><tr><th>Peça</th><th class="dir">Vendidas</th><th class="dir" style="width:90px">Devolver</th></tr></thead>
          <tbody>${linhas.map((l, idx) => `<tr>
            <td>${esc(l.rotulo)}</td>
            <td class="dir num">${l.restante}</td>
            <td class="dir"><input type="number" min="0" max="${l.restante}" value="0" data-qtd="${idx}" style="text-align:right"></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="campo-grupo mt"><label for="dv-motivo">Motivo</label>
          <select id="dv-motivo">
            <option>Troca de tamanho</option><option>Defeito</option>
            <option>Arrependimento</option><option>Não serviu</option><option>Outro</option>
          </select></div>
        <div class="campo-grupo"><label for="dv-forma">Como o valor foi devolvido</label>
          <select id="dv-forma">
            <option value="dinheiro">Dinheiro</option><option value="pix">PIX</option>
            <option value="estorno">Estorno no cartão</option><option value="credito-loja">Crédito na loja</option>
            <option value="troca">Troca por outra peça</option>
          </select></div>
        <label class="checkbox-linha mt"><input type="checkbox" id="dv-estoque" checked>
          <span>As peças voltam para o estoque</span></label>
        <div class="dica">Desmarque se a peça voltou com defeito e não pode ser revendida.</div>`,
      botoes: [
        { texto: 'Cancelar', acao: (f) => f() },
        {
          texto: 'Registrar devolução', classe: 'btn-primario',
          acao: async (fechar, r) => {
            const itens = [];
            r.querySelectorAll('[data-qtd]').forEach((inp) => {
              const qtd = parseInt(inp.value, 10) || 0;
              if (qtd > 0) itens.push({ varianteId: linhas[Number(inp.dataset.qtd)].varianteId, qtd });
            });
            if (!itens.length) { toast('Informe a quantidade de pelo menos uma peça.', 'erro'); return; }
            await acoes.devolverVenda(vendaId, itens, {
              motivo: r.querySelector('#dv-motivo').value,
              formaDevolucao: r.querySelector('#dv-forma').value,
              retornaEstoque: r.querySelector('#dv-estoque').checked,
            });
            fechar(); toast('Devolução registrada.', 'ok');
          },
        },
      ],
    });
    void m;
  });
  void rotuloRecebivel;
}
