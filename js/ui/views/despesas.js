// despesas.js — o que sai. Fixa x variavel importa: e' o que permite calcular
// ponto de equilibrio e saber quanto a loja precisa vender para se pagar.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { brl, esc, iso, dataBR, competencia, competenciaBR, somaMeses } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, modalFormulario, confirmar, vazio, tag, paraCSV, csvMoeda, baixarArquivo , vista } from '../ui.js';
import { rosca } from '../graficos.js';
import { fluxoCaixaMensal } from '../../domain/consultas.js';
import { irPara } from '../router.js';

let comp = competencia(iso());

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function meses() {
  const e = log.estado();
  const atual = competencia(iso());
  const conjunto = new Set(Object.values(e.despesas).map((d) => d.competencia));
  conjunto.add(atual);
  conjunto.add(comp);
  // Todos os meses do ano corrente, inclusive os que ainda nao chegaram: e'
  // assim que se planeja o ano, e e' o acumulado desses meses que a meta usa.
  const ano = atual.slice(0, 4);
  for (let m = 1; m <= 12; m++) conjunto.add(`${ano}-${String(m).padStart(2, '0')}`);
  return [...conjunto].filter(Boolean).sort().reverse();
}

/** Mes anterior e seguinte da lista, para as setas de navegacao. */
function vizinhos() {
  const lista = [...meses()].sort();
  const i = lista.indexOf(comp);
  return { anterior: i > 0 ? lista[i - 1] : null, seguinte: i >= 0 && i < lista.length - 1 ? lista[i + 1] : null };
}

function html() {
  const e = log.estado();
  const atual = competencia(iso());
  const futuro = comp > atual;
  const viz = vizinhos();
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
    <button class="btn btn-icone" data-ir-mes="${esc(viz.anterior || '')}" aria-label="Mês anterior"
      ${viz.anterior ? '' : 'disabled'}>${icone('voltar', 16)}</button>
    <div class="campo-grupo"><label>Competência</label>
      <select data-mes>${meses().map((m) => `<option value="${m}"${m === comp ? ' selected' : ''}>${competenciaBR(m)}${m > atual ? ' — a chegar' : ''}</option>`).join('')}</select></div>
    <button class="btn btn-icone" data-ir-mes="${esc(viz.seguinte || '')}" aria-label="Mês seguinte"
      ${viz.seguinte ? '' : 'disabled'}>${icone('avancar', 16)}</button>
    <div class="crescer"></div>
    <button class="btn btn-primario" data-acao="nova">${icone('mais', 16)} Nova despesa</button>
    <button class="btn" data-acao="recorrentes">${icone('sincronizar', 16)} Repetir recorrentes</button>
    ${futuro || comp === atual ? `<button class="btn" data-acao="recorrentes-ano">${icone('calendario', 16)} Repetir até dezembro</button>` : ''}
    <button class="btn" data-acao="csv">${icone('documento', 16)} CSV</button>
  </div>

  ${futuro ? `<div class="aviso aviso-info">${icone('info')}<div>
    <strong>${esc(competenciaBR(comp))} ainda não chegou.</strong>
    O que você lançar aqui entra como <strong>previsão</strong>: pesa no resultado deste mês na DRE e no
    acumulado do fluxo, e vira saída de caixa de verdade no dia em que for marcada como paga.</div></div>` : ''}

  <div class="grade grade-4 mb">
    ${kpi('Total do mês', brl(fixas + variaveis), lista.length + ' lançamentos')}
    ${kpi('Fixas', brl(fixas))}
    ${kpi('Variáveis', brl(variaveis))}
    ${kpi('Ainda a pagar', brl(aPagar), aPagar ? 'não marcadas como pagas' : 'tudo quitado')}
  </div>

  ${reflexoHTML(e, comp, atual)}

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

/**
 * O reflexo do que foi lancado aqui no resultado do ANO.
 *
 * Existe porque a pergunta que o dono faz ao lancar despesa de novembro nao e'
 * "quanto gastei em novembro", e' "o ano ainda fecha no azul?". Sem isto ele
 * lancava a despesa, ia para a tela inicial, olhava o acumulado, voltava.
 */
function reflexoHTML(e, comp, atual) {
  const ano = comp.slice(0, 4);
  // Fora do ano corrente o acumulado do ano nao diz nada sobre este mes.
  if (ano !== atual.slice(0, 4)) return '';
  const fluxo = fluxoCaixaMensal(e, { hoje: iso(), ano: Number(ano) });
  const mes = fluxo.meses.find((m) => m.comp === comp);
  if (!mes) return '';
  const dezembro = fluxo.meses[fluxo.meses.length - 1];
  const acumulado = mes.acumuladoOperacional;
  const fecha = dezembro ? dezembro.acumuladoOperacional : 0;
  const semEntrada = mes.futuro && mes.entradasTotal === 0;

  return `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer"><h3>Reflexo no resultado do ano</h3>
        <div class="texto-2 pequeno">valores em R$ · o mesmo acumulado que aparece no fluxo da tela inicial</div></div>
      <button class="btn btn-p" data-ir="/">Ver o fluxo</button>
    </div>
    <div class="grade grade-3">
      ${kpi('Saldo de ' + competenciaBR(comp), brl(mes.saldo),
        `entra ${brl(mes.entradasTotal)} · sai ${brl(mes.saidasTotal)}`)}
      ${kpi('Acumulado até ' + competenciaBR(comp), brl(acumulado),
        acumulado < 0 ? 'no prejuízo' : 'no lucro')}
      ${kpi('Fecha o ano em', brl(fecha), fecha < 0 ? 'como está previsto' : 'como está previsto',
        fecha < 0 ? '' : 'destaque')}
    </div>
    ${semEntrada ? `<p class="dica"><strong>${esc(competenciaBR(comp))} ainda não tem entrada prevista.</strong>
      O app só conta como previsão o que já está contratado — parcela de cartão e a prazo com vencimento
      marcado. Venda que ainda não aconteceu não entra, de propósito. Então o saldo deste mês aparece bem
      negativo: são as despesas contra um faturamento que ainda não existe. Serve para comparar cenários de
      custo e para dimensionar a meta, não para prever o resultado.</p>` : ''}
    <p class="dica">Despesa marcada como <strong>a pagar</strong> pesa no mês do vencimento. Ao marcar como
      paga, ela vira saída de caixa no dia do pagamento — o acumulado se ajusta sozinho.</p>
  </div>`;
}

/**
 * Dia 5 do mes, ou o dia 1 se o mes ja' comecou: e' o vencimento tipico de
 * aluguel e conta de consumo, e um palpite melhor do que "hoje" para despesa
 * de mes que ainda nao chegou. Continua editavel no formulario.
 */
function primeiroDiaUtilDe(comp) {
  return comp + '-05';
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
  liga(raiz, 'click', '[data-ir-mes]', (ev, el) => {
    if (!el.dataset.irMes) return;
    comp = el.dataset.irMes;
    redesenhar();
  });
  liga(raiz, 'click', '[data-ir]', (ev, el) => irPara(el.dataset.ir));

  liga(raiz, 'click', '[data-acao="nova"]', () => {
    const modal = modalFormulario({
      titulo: 'Nova despesa' + (comp === competencia(iso()) ? '' : ' — ' + competenciaBR(comp)),
      campos: camposDespesa(e, {}),
      // Mes futuro aberto: a data nasce nele, e a despesa nasce COMO A PAGAR.
      // Despesa de novembro marcada como paga hoje seria dinheiro saindo do
      // caixa de hoje por uma conta que ninguem pagou ainda.
      valores: comp === competencia(iso())
        ? { tipo: 'variavel', pago: true, data: iso() }
        : { tipo: 'variavel', pago: false, data: primeiroDiaUtilDe(comp) },
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

  liga(raiz, 'click', '[data-acao="recorrentes-ano"]', async () => {
    const atual = competencia(iso());
    const ano = atual.slice(0, 4);
    const de = Number(atual.slice(5, 7));
    if (de >= 12) { toast('Dezembro é o último mês do ano — nada para projetar.'); return; }
    const ok = await confirmar('Repetir recorrentes até dezembro',
      `Copia as despesas marcadas como "repete todo mês" de ${competenciaBR(atual)} para cada mês até `
      + `dezembro, todas como a pagar. Mês que já tiver a mesma despesa é deixado como está.`,
      { textoOk: 'Projetar o ano' });
    if (!ok) return;
    // Encadeado: cada mes copia do anterior, entao o de dezembro sai do de
    // novembro que acabou de ser criado. Copiar tudo do mes atual perderia
    // ajuste feito no meio do caminho.
    let origem = atual;
    let criadas = 0;
    for (let m = de + 1; m <= 12; m++) {
      const destino = `${ano}-${String(m).padStart(2, '0')}`;
      const evs = await acoes.repetirRecorrentes(origem, destino);
      criadas += evs.length;
      origem = destino;
    }
    toast(criadas
      ? `${criadas} despesa(s) projetada(s) até dezembro, como a pagar.`
      : 'Nada a projetar — ou não há despesa recorrente, ou os meses já estão preenchidos.',
      criadas ? 'ok' : '');
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
