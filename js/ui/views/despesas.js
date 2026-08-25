// despesas.js — o que sai. Fixa x variavel importa: e' o que permite calcular
// ponto de equilibrio e saber quanto a loja precisa vender para se pagar.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { brl, esc, iso, dataBR, competencia, competenciaBR, somaMeses } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, modalFormulario, confirmar, vazio, tag, paraCSV, csvMoeda, baixarArquivo , vista } from '../ui.js';
import { rosca } from '../graficos.js';

let comp = competencia(iso());

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function meses() {
  const e = log.estado();
  const conjunto = new Set(Object.values(e.despesas).map((d) => d.competencia));
  conjunto.add(competencia(iso()));
  conjunto.add(comp);
  return [...conjunto].filter(Boolean).sort().reverse();
}

function html() {
  const e = log.estado();
  const lista = Object.values(e.despesas)
    .filter((d) => d.competencia === comp)
    .sort((a, b) => b.data.localeCompare(a.data));

  const fixas = lista.filter((d) => d.tipo === 'fixa').reduce((s, d) => s + d.valor, 0);
  const variaveis = lista.filter((d) => d.tipo === 'variavel').reduce((s, d) => s + d.valor, 0);
  const aPagar = lista.filter((d) => !d.pago).reduce((s, d) => s + d.valor, 0);

  const porCategoria = {};
  for (const d of lista) porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + d.valor;
  const dadosRosca = Object.entries(porCategoria).map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);

  return `
  <div class="filtros">
    <div class="campo-grupo"><label>Competência</label>
      <select data-mes>${meses().map((m) => `<option value="${m}"${m === comp ? ' selected' : ''}>${competenciaBR(m)}</option>`).join('')}</select></div>
    <div class="crescer"></div>
    <button class="btn btn-primario" data-acao="nova">${icone('mais', 16)} Nova despesa</button>
    <button class="btn" data-acao="recorrentes">${icone('sincronizar', 16)} Repetir recorrentes</button>
    <button class="btn" data-acao="csv">${icone('documento', 16)} CSV</button>
  </div>

  <div class="grade grade-4 mb">
    ${kpi('Total do mês', brl(fixas + variaveis), lista.length + ' lançamentos')}
    ${kpi('Fixas', brl(fixas))}
    ${kpi('Variáveis', brl(variaveis))}
    ${kpi('Ainda a pagar', brl(aPagar), aPagar ? 'não marcadas como pagas' : 'tudo quitado')}
  </div>

  ${lista.length ? `
  <div class="grade grade-2">
    <div class="cartao">
      <h3>Lançamentos</h3>
      <div class="lista">${lista.map((d) => `
        <div class="item" data-editar="${d.id}">
          <div class="avatar">${icone(d.tipo === 'fixa' ? 'cadeado' : 'raio', 16)}</div>
          <div class="corpo">
            <div class="titulo">${esc(d.categoria)} ${d.recorrente ? tag('recorrente', 'roxo') : ''} ${d.pago ? '' : tag('a pagar', 'alerta')}</div>
            <div class="sub">${dataBR(d.data)}${d.descricao ? ' · ' + esc(d.descricao) : ''}${d.fornecedor ? ' · ' + esc(d.fornecedor) : ''}</div>
          </div>
          <div class="valor">${brl(d.valor)}<small>${d.tipo === 'fixa' ? 'fixa' : 'variável'}</small></div>
        </div>`).join('')}</div>
    </div>
    <div class="cartao">
      <h3>Para onde foi</h3>
      ${rosca(dadosRosca)}
    </div>
  </div>`
    : vazio('documento', 'Nenhuma despesa em ' + competenciaBR(comp),
      'Lance aluguel, energia, embalagens, marketing — tudo que sai. Sem isso a DRE mostra lucro que não existe.',
      '<button class="btn btn-primario" data-acao="nova">Lançar a primeira</button>')}`;
}

function camposDespesa(e, valores) {
  const cats = e.config.categoriasDespesa || [];
  return [
    { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, meia: true, valor: valores.data || iso() },
    { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true, meia: true },
    { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', obrigatorio: true, meia: true,
      opcoes: cats.map((c) => ({ v: c.nome, t: c.nome })) },
    { nome: 'tipo', rotulo: 'Natureza', tipo: 'select', meia: true,
      opcoes: [{ v: 'fixa', t: 'Fixa — existe mesmo sem vender' }, { v: 'variavel', t: 'Variável — acompanha a venda' }] },
    { nome: 'descricao', rotulo: 'Descrição', meia: true },
    { nome: 'fornecedor', rotulo: 'Fornecedor', meia: true },
    { nome: 'formaPagto', rotulo: 'Forma de pagamento', tipo: 'select', meia: true,
      opcoes: [{ v: 'pix', t: 'PIX' }, { v: 'dinheiro', t: 'Dinheiro' }, { v: 'debito', t: 'Débito' },
        { v: 'credito', t: 'Crédito' }, { v: 'boleto', t: 'Boleto' }, { v: 'transferencia', t: 'Transferência' }] },
    { nome: 'pago', rotulo: 'Já foi paga', tipo: 'checkbox', valor: valores.pago !== false },
    { nome: 'recorrente', rotulo: 'Repete todo mês', tipo: 'checkbox', valor: !!valores.recorrente,
      dica: 'Marcadas assim podem ser copiadas para o mês seguinte com um clique.' },
    { nome: 'obs', rotulo: 'Observações', tipo: 'textarea' },
  ];
}

function ligar(raiz, redesenhar) {
  const e = log.estado();

  liga(raiz, 'change', '[data-mes]', (ev, el) => { comp = el.value; redesenhar(); });

  liga(raiz, 'click', '[data-acao="nova"]', () => {
    const modal = modalFormulario({
      titulo: 'Nova despesa',
      campos: camposDespesa(e, {}),
      valores: { tipo: 'variavel', pago: true, data: iso() },
      aoSalvar: async (d, fechar) => {
        await acoes.lancarDespesa(d);
        fechar(); toast('Despesa lançada.', 'ok');
        comp = competencia(d.data); redesenhar();
      },
    });
    // A natureza (fixa/variavel) segue a categoria escolhida, mas continua editavel.
    const form = modal.el.querySelector('form');
    const selCat = form.elements.categoria;
    const selTipo = form.elements.tipo;
    selCat.addEventListener('change', () => {
      const achou = (e.config.categoriasDespesa || []).find((c) => c.nome === selCat.value);
      if (achou) selTipo.value = achou.tipo;
    });
    selCat.dispatchEvent(new Event('change'));
  });

  liga(raiz, 'click', '[data-editar]', (ev, el) => {
    const d = e.despesas[el.dataset.editar];
    if (!d) return;
    modalFormulario({
      titulo: 'Editar despesa',
      campos: camposDespesa(e, d),
      valores: d,
      botoesExtras: [{
        texto: 'Excluir', classe: 'btn-perigo',
        acao: async (fechar) => {
          const ok = await confirmar('Excluir despesa',
            `Excluir "${esc(d.categoria)} — ${brl(d.valor)}"? O lançamento sai da DRE deste mês.`,
            { textoOk: 'Excluir', perigo: true });
          if (!ok) return;
          await acoes.excluirDespesa(d.id);
          fechar(); toast('Despesa excluída.');
        },
      }],
      aoSalvar: async (dados, fechar) => {
        await acoes.editarDespesa(d.id, dados);
        fechar(); toast('Despesa atualizada.', 'ok');
      },
    });
  });

  liga(raiz, 'click', '[data-acao="recorrentes"]', async () => {
    const anterior = somaMeses(comp, -1);
    const evs = await acoes.repetirRecorrentes(anterior, comp);
    if (!evs.length) {
      toast(`Nada a copiar de ${competenciaBR(anterior)} — sem despesas recorrentes novas.`);
      return;
    }
    toast(`${evs.length} despesa(s) copiada(s) de ${competenciaBR(anterior)}, marcadas como a pagar.`, 'ok');
  });

  liga(raiz, 'click', '[data-acao="csv"]', () => {
    const lista = Object.values(e.despesas).filter((d) => d.competencia === comp)
      .sort((a, b) => a.data.localeCompare(b.data));
    const csv = paraCSV(
      ['Data', 'Competência', 'Categoria', 'Natureza', 'Descrição', 'Fornecedor', 'Forma', 'Pago', 'Valor'],
      lista.map((d) => [dataBR(d.data), d.competencia, d.categoria, d.tipo === 'fixa' ? 'Fixa' : 'Variável',
        d.descricao, d.fornecedor, d.formaPagto, d.pago ? 'Sim' : 'Não', csvMoeda(d.valor)])
    );
    baixarArquivo(`AME Store - despesas ${comp}.csv`, csv, 'text/csv');
    toast('Arquivo gerado.', 'ok');
  });
}
