// clientes.js — cadastro, historico e saldo em fiado.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { saldoFiado } from '../../core/state.js';
import { brl, esc, normaliza, dataBR } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, modalFormulario, vazio, iniciais, tag, debounce , vista } from '../ui.js';
import { irPara } from '../router.js';

let termo = '';

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function html() {
  const e = log.estado();
  const todos = Object.values(e.clientes).filter((c) => c.ativo);
  const t = normaliza(termo);

  const lista = todos.map((c) => {
    const vendas = Object.values(e.vendas).filter((v) => v.clienteId === c.id && v.status !== 'cancelada');
    const total = vendas.reduce((s, v) => s + v.totais.liquido, 0);
    const ultima = vendas.map((v) => v.data).sort().pop();
    return { ...c, nVendas: vendas.length, total, ultima, fiado: saldoFiado(e, c.id) };
  }).filter((c) => !t || normaliza(c.nome + ' ' + c.telefone).includes(t))
    .sort((a, b) => b.total - a.total);

  const fiadoTotal = lista.reduce((s, c) => s + c.fiado, 0);
  const comFiado = lista.filter((c) => c.fiado > 0).length;

  return `
  <div class="grade grade-3 mb">
    ${kpi('Clientes', String(todos.length))}
    ${kpi('Em fiado', brl(fiadoTotal), comFiado ? comFiado + ' cliente(s) com saldo' : 'ninguém devendo')}
    ${kpi('Ticket médio geral', brl(lista.length && lista.some((c) => c.nVendas)
      ? Math.round(lista.reduce((s, c) => s + c.total, 0) / Math.max(1, lista.reduce((s, c) => s + c.nVendas, 0)))
      : 0))}
  </div>

  <div class="barra-botoes mb">
    <button class="btn btn-primario" data-acao="novo">${icone('mais', 16)} Novo cliente</button>
  </div>

  <div class="busca mb">${icone('busca')}
    <input id="c-busca" placeholder="Buscar por nome ou telefone" value="${esc(termo)}"></div>

  ${lista.length ? `<div class="cartao"><div class="lista">${lista.map((c) => `
    <div class="item" data-cliente="${c.id}">
      <div class="avatar">${esc(iniciais(c.nome))}</div>
      <div class="corpo">
        <div class="titulo">${esc(c.nome)} ${c.fiado > 0 ? tag('fiado ' + brl(c.fiado), 'alerta') : ''}</div>
        <div class="sub">${esc(c.telefone || 'sem telefone')}${c.ultima ? ' · última compra ' + dataBR(c.ultima) : ' · nunca comprou'}</div>
      </div>
      <div class="valor">${brl(c.total)}<small>${c.nVendas} compra(s)</small></div>
    </div>`).join('')}</div></div>`
    : vazio('pessoas', termo ? 'Nada encontrado' : 'Nenhum cliente cadastrado',
      'Cadastrar cliente permite vender fiado, ver o histórico de compras e saber quem são as melhores clientes.',
      '<button class="btn btn-primario" data-acao="novo">Cadastrar cliente</button>')}`;
}

const CAMPOS = [
  { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
  { nome: 'telefone', rotulo: 'Telefone / WhatsApp', meia: true, attrs: 'inputmode="tel"' },
  { nome: 'aniversario', rotulo: 'Aniversário', tipo: 'data', meia: true },
  { nome: 'email', rotulo: 'E-mail', meia: true, attrs: 'inputmode="email"' },
  { nome: 'obs', rotulo: 'Observações', tipo: 'textarea', dica: 'Tamanho que usa, preferências, o que quiser lembrar.' },
];

export function abrirNovoCliente(aoCriar) {
  return modalFormulario({
    titulo: 'Novo cliente',
    campos: CAMPOS,
    aoSalvar: async (d, fechar) => {
      const id = await acoes.criarCliente(d);
      fechar(); toast('Cliente cadastrado.', 'ok');
      if (aoCriar) aoCriar(id);
    },
  });
}

function ligar(raiz, redesenhar) {
  const busca = raiz.querySelector('#c-busca');
  if (busca) busca.addEventListener('input', debounce((ev) => {
    termo = ev.target.value; redesenhar();
    const b = document.getElementById('c-busca');
    if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  }, 220));
  liga(raiz, 'click', '[data-acao="novo"]', () => abrirNovoCliente());
  liga(raiz, 'click', '[data-cliente]', (ev, el) => irPara('/cliente/' + el.dataset.cliente));
}

export { CAMPOS as camposCliente };
