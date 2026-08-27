// impressao.js — os papéis que saem do app: o comprovante da venda e o extrato
// da cliente.
//
// Não existe gerador de PDF aqui, e é de propósito: biblioteca de PDF pesa mais
// que o app inteiro e precisaria de etapa de build. O caminho é a impressão do
// próprio navegador — no celular e no PC, "Imprimir" oferece "Salvar como PDF",
// e o arquivo sai com fonte de verdade, selecionável e leve.
//
// A tela é montada num bloco à parte (`.folha`), que só existe na hora de
// imprimir. Assim o papel não herda a navegação, os botões e os cartões da tela.
import { brl, esc, dataBR, iso, dataHora } from '../core/fmt.js';
import { nomeVariante } from '../core/state.js';
import { saldoDe, emAberto } from '../domain/consultas.js';

/** A marca, desenhada em SVG para sair nítida em qualquer impressora. */
function logo() {
  return `<svg class="folha-logo" viewBox="0 0 512 512" role="img" aria-label="AME Store">
    <rect width="512" height="512" rx="112" fill="#E5D4F5"/>
    <text x="256" y="268" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
      font-size="118" letter-spacing="4" fill="#3A3335">A.M.E</text>
    <rect x="96" y="300" width="320" height="52" fill="#F5F2F7"/>
    <text x="256" y="336" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-size="30" letter-spacing="14" fill="#5C5254">STORE</text>
  </svg>`;
}

function cabecalho(estado, titulo, subtitulo) {
  const loja = estado.config.loja || {};
  return `<header class="folha-topo">
    ${logo()}
    <div class="folha-marca">
      <div class="folha-nome">${esc(loja.nome || 'AME Store')}</div>
      ${loja.cnpj ? `<div class="folha-linha">CNPJ ${esc(loja.cnpj)}</div>` : ''}
      ${loja.telefone ? `<div class="folha-linha">${esc(loja.telefone)}</div>` : ''}
      ${loja.endereco ? `<div class="folha-linha">${esc(loja.endereco)}</div>` : ''}
    </div>
    <div class="folha-titulo">
      <div class="folha-h1">${esc(titulo)}</div>
      <div class="folha-linha">${esc(subtitulo)}</div>
    </div>
  </header>`;
}

function rodape(texto) {
  return `<footer class="folha-rodape">
    <div>${esc(texto)}</div>
    <div>Emitido em ${esc(dataHora(Date.now()))} · AME Store</div>
  </footer>`;
}

/** Comprovante de uma venda: peças, valores e, no fiado, a agenda das parcelas. */
export function comprovanteVenda(estado, venda) {
  const cliente = venda.clienteId ? estado.clientes[venda.clienteId] : null;
  const parcelas = Object.values(estado.recebiveis)
    .filter((r) => r.vendaId === venda.id && r.status !== 'cancelado')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const aPrazo = parcelas.filter((r) => emAberto(r));
  const nomes = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado' };

  return `
  ${cabecalho(estado, 'Comprovante de venda', `Venda nº ${venda.numero} · ${dataBR(venda.data)}${venda.hora ? ' às ' + venda.hora : ''}`)}

  ${cliente ? `<section class="folha-bloco">
    <div class="folha-rotulo">Cliente</div>
    <div class="folha-destaque">${esc(cliente.nome)}</div>
    ${cliente.telefone ? `<div class="folha-linha">${esc(cliente.telefone)}</div>` : ''}
  </section>` : ''}

  <table class="folha-tabela">
    <thead><tr><th>Peça</th><th class="dir">Qtd</th><th class="dir">Preço</th>
      <th class="dir">Desc.</th><th class="dir">Total</th></tr></thead>
    <tbody>${venda.itens.map((i) => `<tr>
      <td>${esc(nomeVariante(estado, i.varianteId))}</td>
      <td class="dir">${i.qtd}</td>
      <td class="dir">${brl(i.precoUnit)}</td>
      <td class="dir">${i.descontoUnit ? '− ' + brl(i.descontoUnit) : '—'}</td>
      <td class="dir">${brl(i.bruto - i.desconto)}</td></tr>`).join('')}</tbody>
    <tfoot>
      ${venda.descontoGeral ? `<tr><td colspan="4">Desconto na venda</td><td class="dir">− ${brl(venda.descontoGeral)}</td></tr>` : ''}
      ${venda.freteCobrado ? `<tr><td colspan="4">Frete</td><td class="dir">${brl(venda.freteCobrado)}</td></tr>` : ''}
      <tr class="folha-total"><td colspan="4">Total da compra</td><td class="dir">${brl(venda.totais.liquido)}</td></tr>
    </tfoot>
  </table>

  <section class="folha-bloco">
    <div class="folha-rotulo">Pagamento</div>
    ${(venda.pagamentos || []).map((p) => `<div class="folha-linha">
      ${esc(nomes[p.forma] || p.forma)}${(p.parcelas || 1) > 1 ? ` em ${p.parcelas}×` : ''} · ${brl(p.valor)}</div>`).join('')}
  </section>

  ${parcelas.length ? `
  <table class="folha-tabela">
    <thead><tr><th>Parcela</th><th>Vencimento</th><th class="dir">Valor</th>
      <th class="dir">Pago</th><th class="dir">Falta</th></tr></thead>
    <tbody>${parcelas.map((r) => `<tr>
      <td>${esc(nomes[r.tipo] || r.tipo)}${r.totalParcelas > 1 ? ` ${r.parcela}/${r.totalParcelas}` : ''}</td>
      <td>${dataBR(r.vencimento)}</td>
      <td class="dir">${brl(r.liquido)}</td>
      <td class="dir">${r.pago ? brl(r.pago) : '—'}</td>
      <td class="dir ${saldoDe(r) ? 'folha-devendo' : ''}">${saldoDe(r) ? brl(saldoDe(r)) : 'quitada'}</td></tr>`).join('')}</tbody>
    ${aPrazo.length ? `<tfoot><tr class="folha-total"><td colspan="4">Total a pagar</td>
      <td class="dir">${brl(aPrazo.reduce((s, r) => s + saldoDe(r), 0))}</td></tr></tfoot>` : ''}
  </table>` : ''}

  ${venda.obs ? `<section class="folha-bloco"><div class="folha-rotulo">Observações</div>
    <div class="folha-linha">${esc(venda.obs)}</div></section>` : ''}

  ${rodape('Obrigada pela preferência!')}`;
}

/**
 * Extrato de uma cliente: o que já pagou e o que falta pagar.
 * `apenasEstas` limita às parcelas escolhidas na tela; vazio mostra todas.
 */
export function extratoCliente(estado, clienteId, apenasEstas = null) {
  const cliente = estado.clientes[clienteId];
  const todas = Object.values(estado.recebiveis)
    .filter((r) => r.clienteId === clienteId && r.status !== 'cancelado')
    .filter((r) => !apenasEstas || apenasEstas.includes(r.id))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const total = todas.reduce((s, r) => s + r.liquido, 0);
  const pago = todas.reduce((s, r) => s + (r.pago || 0), 0);
  const falta = todas.reduce((s, r) => s + saldoDe(r), 0);
  const hoje = iso();
  const vencidas = todas.filter((r) => emAberto(r) && r.vencimento < hoje);

  return `
  ${cabecalho(estado, 'Extrato do cliente', `${cliente ? cliente.nome : 'Cliente'} · posição em ${dataBR(hoje)}`)}

  <section class="folha-resumo">
    <div><div class="folha-rotulo">Total das compras</div><div class="folha-destaque">${brl(total)}</div></div>
    <div><div class="folha-rotulo">Já pago</div><div class="folha-destaque folha-pago">${brl(pago)}</div></div>
    <div><div class="folha-rotulo">Falta pagar</div><div class="folha-destaque folha-devendo">${brl(falta)}</div></div>
  </section>

  ${vencidas.length ? `<p class="folha-aviso">${vencidas.length} parcela(s) vencida(s),
    somando ${brl(vencidas.reduce((s, r) => s + saldoDe(r), 0))}.</p>` : ''}

  <table class="folha-tabela">
    <thead><tr><th>Origem</th><th>Vencimento</th><th class="dir">Valor</th>
      <th class="dir">Pago</th><th class="dir">Falta</th><th>Situação</th></tr></thead>
    <tbody>${todas.map((r) => {
      const resta = saldoDe(r);
      const situacao = resta === 0 ? 'paga'
        : r.vencimento < hoje ? 'vencida'
        : r.status === 'parcial' ? 'parcial' : 'a vencer';
      return `<tr>
        <td>${r.numeroVenda ? 'Venda nº ' + r.numeroVenda : esc(r.descricao || 'Saldo anterior')}
          ${r.totalParcelas > 1 ? `<br><span class="folha-linha">parcela ${r.parcela} de ${r.totalParcelas}</span>` : ''}</td>
        <td>${dataBR(r.vencimento)}</td>
        <td class="dir">${brl(r.liquido)}</td>
        <td class="dir">${r.pago ? brl(r.pago) : '—'}</td>
        <td class="dir ${resta ? 'folha-devendo' : ''}">${resta ? brl(resta) : '—'}</td>
        <td>${situacao}</td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr class="folha-total"><td colspan="2">Totais</td>
      <td class="dir">${brl(total)}</td>
      <td class="dir">${brl(pago)}</td>
      <td class="dir">${brl(falta)}</td><td></td></tr></tfoot>
  </table>

  ${rodape(falta > 0 ? 'Valores em aberto conforme combinado na loja.' : 'Nada em aberto. Obrigada!')}`;
}

/**
 * Põe a folha na tela só o tempo da impressão e manda imprimir.
 * O bloco é removido depois — ele não faz parte da interface.
 */
export function imprimirFolha(html) {
  document.querySelectorAll('.folha').forEach((f) => f.remove());
  const folha = document.createElement('div');
  folha.className = 'folha';
  folha.innerHTML = html;
  document.body.appendChild(folha);
  document.body.classList.add('imprimindo');

  const limpar = () => {
    document.body.classList.remove('imprimindo');
    folha.remove();
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);
  // Safari no iPhone nao dispara afterprint de forma confiavel: o limpador
  // atrasado garante que a folha nao fique presa na tela.
  setTimeout(() => { if (document.body.classList.contains('imprimindo')) limpar(); }, 60000);

  setTimeout(() => window.print(), 60);
}
