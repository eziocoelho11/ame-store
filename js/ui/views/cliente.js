// cliente.js — ficha do cliente: compras, fiado em aberto, preferencias.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { saldoFiado, nomeVariante } from '../../core/state.js';
import { recebiveis } from '../../domain/consultas.js';
import { brl, esc, dataBR, iso, num } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, modalFormulario, confirmar, tag, iniciais , vista } from '../ui.js';
import { camposCliente } from './clientes.js';
import { irPara } from '../router.js';

export async function render(raiz, params) {
  const desenhar = vista(raiz, () => html(params.id), (caixa) => ligar(caixa, params.id));
  return log.assinar(desenhar);
}

function html(clienteId) {
  const e = log.estado();
  const c = e.clientes[clienteId];
  if (!c) return '<div class="aviso aviso-erro">Cliente não encontrado.</div>';

  const vendas = Object.values(e.vendas)
    .filter((v) => v.clienteId === clienteId && v.status !== 'cancelada')
    .sort((a, b) => b.data.localeCompare(a.data));
  const total = vendas.reduce((s, v) => s + v.totais.liquido, 0);
  const pecas = vendas.reduce((s, v) => s + v.itens.reduce((t, i) => t + i.qtd, 0), 0);
  const fiado = saldoFiado(e, clienteId);
  const emAberto = recebiveis(e, { status: 'aberto', clienteId, tipo: 'fiado' });

  // O que ela mais compra — util para avisar quando chegar peca parecida.
  const contagem = {};
  for (const v of vendas) for (const i of v.itens) {
    const variante = e.variantes[i.varianteId];
    if (!variante) continue;
    const p = e.produtos[variante.produtoId];
    const cat = p ? (p.categoria || 'Outros') : 'Outros';
    contagem[cat] = (contagem[cat] || 0) + i.qtd;
    if (variante.tamanho) contagem['__tam_' + variante.tamanho] = (contagem['__tam_' + variante.tamanho] || 0) + i.qtd;
  }
  const tamanhoFavorito = Object.entries(contagem).filter(([k]) => k.startsWith('__tam_'))
    .sort((a, b) => b[1] - a[1]).map(([k]) => k.replace('__tam_', ''))[0];
  const categorias = Object.entries(contagem).filter(([k]) => !k.startsWith('__tam_'))
    .sort((a, b) => b[1] - a[1]).slice(0, 4);

  return `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="avatar" style="width:48px;height:48px;font-size:1rem">${esc(iniciais(c.nome))}</div>
      <div class="crescer">
        <h2>${esc(c.nome)}</h2>
        <div class="texto-2 pequeno">${esc(c.telefone || 'sem telefone')}${c.email ? ' · ' + esc(c.email) : ''}
          ${c.aniversario ? ' · aniversário ' + dataBR(c.aniversario) : ''}</div>
      </div>
      <button class="btn btn-icone" data-acao="editar" aria-label="Editar">${icone('editar')}</button>
    </div>
    <div class="grade grade-4">
      ${kpi('Total comprado', brl(total), vendas.length + ' compra(s)')}
      ${kpi('Ticket médio', brl(vendas.length ? Math.round(total / vendas.length) : 0), num(pecas) + ' peças')}
      ${kpi('Em fiado', brl(fiado), fiado ? emAberto.length + ' parcela(s)' : 'em dia', fiado ? '' : '')}
      ${kpi('Tamanho que mais leva', tamanhoFavorito || '—',
        categorias.length ? categorias.map(([k]) => k).join(', ') : '')}
    </div>
    ${c.obs ? `<p class="dica mt">${esc(c.obs)}</p>` : ''}
    ${c.telefone ? `<div class="barra-botoes mt">
      <a class="btn" target="_blank" rel="noopener"
         href="https://wa.me/55${esc(String(c.telefone).replace(/\D/g, ''))}">${icone('pessoas', 16)} WhatsApp</a>
    </div>` : ''}
  </div>

  ${emAberto.length ? `<div class="cartao">
    <h3>Fiado em aberto</h3>
    <div class="lista">${emAberto.map((r) => `
      <div class="item" style="cursor:default">
        <div class="corpo"><div class="titulo">${r.vendaId ? 'Venda #' + r.numeroVenda : esc(r.descricao || 'Saldo importado')}</div>
          <div class="sub">vence ${dataBR(r.vencimento)} ${r.vencimento < iso() ? tag('vencido', 'erro') : ''}</div></div>
        <div class="valor">${brl(r.liquido)}<small><button class="btn btn-p" data-baixar="${esc(r.id)}">Recebi</button></small></div>
      </div>`).join('')}</div>
  </div>` : ''}

  <div class="cartao">
    <h3>Compras</h3>
    ${vendas.length ? `<div class="lista">${vendas.map((v) => `
      <div class="item" data-venda="${v.id}">
        <div class="avatar">#${v.numero}</div>
        <div class="corpo"><div class="titulo">${dataBR(v.data)} · ${esc(v.canalNome)}</div>
          <div class="sub">${v.itens.map((i) => esc(nomeVariante(e, i.varianteId))).join(' · ')}</div></div>
        <div class="valor">${brl(v.totais.liquido)}</div>
      </div>`).join('')}</div>`
      : '<p class="texto-3 pequeno">Ainda não comprou.</p>'}
  </div>

  <div class="barra-botoes">
    <button class="btn btn-perigo" data-acao="arquivar">Arquivar cliente</button>
  </div>`;
}

function ligar(raiz, clienteId) {
  const e = log.estado();
  const c = e.clientes[clienteId];
  if (!c) return;

  liga(raiz, 'click', '[data-venda]', (ev, el) => irPara('/venda/' + el.dataset.venda));
  liga(raiz, 'click', '[data-baixar]', async (ev, el) => {
    await acoes.baixarRecebivel(el.dataset.baixar, 'dinheiro', iso());
    toast('Fiado baixado.', 'ok');
  });
  liga(raiz, 'click', '[data-acao="editar"]', () => {
    modalFormulario({
      titulo: 'Editar cliente', campos: camposCliente, valores: c,
      aoSalvar: async (d, fechar) => { await acoes.editarCliente(clienteId, d); fechar(); toast('Cliente atualizado.', 'ok'); },
    });
  });
  liga(raiz, 'click', '[data-acao="arquivar"]', async () => {
    const ok = await confirmar('Arquivar cliente',
      'O cliente some das listas, mas o histórico de compras continua na DRE e nos relatórios.',
      { textoOk: 'Arquivar', perigo: true });
    if (!ok) return;
    await acoes.arquivarCliente(clienteId);
    toast('Cliente arquivado.');
    irPara('/clientes');
  });
}
