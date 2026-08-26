// inicio.js — o painel. Responde em 5 segundos: vendi quanto, sobrou quanto,
// tenho quanto para receber, e falta comprar o que.
import * as log from '../../core/eventlog.js';
import { calcularDRE, faturamento12Meses } from '../../domain/dre.js';
import { aReceber, estoqueBaixo, valorEstoque, vendasDoMes, receitaPorDia, fluxoCaixaMensal } from '../../domain/consultas.js';
import { brl, esc, pct, num, iso, competencia, competenciaBR, competenciaCurta, ultimasCompetencias, limitesDaCompetencia, dataBR } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { kpi, barra, liga , vista } from '../ui.js';
import { linha as grafLinha, barras as grafBarras } from '../graficos.js';
import { irPara } from '../router.js';

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function html() {
  const e = log.estado();
  const hoje = iso();
  const comp = competencia(hoje);
  const dre = calcularDRE(e, comp);
  const receber = aReceber(e, hoje);
  const baixo = estoqueBaixo(e);
  const estoque = valorEstoque(e);
  const vendasMes = vendasDoMes(e, comp);
  const vendasHoje = vendasMes.filter((v) => v.data === hoje);
  const receitaHoje = vendasHoje.reduce((s, v) => s + v.totais.liquido, 0);

  const doze = ultimasCompetencias(comp, 12);
  const acumulado12 = faturamento12Meses(e, doze);
  const mei = e.config.mei || {};
  const teto = mei.tetoAnual || 0;
  const usoTeto = teto > 0 ? (acumulado12 / teto) * 100 : 0;

  const { inicio, fim } = limitesDaCompetencia(comp);
  const serieDia = receitaPorDia(e, inicio, hoje < fim ? hoje : fim)
    .map((d) => ({ rotulo: d.data.slice(8), valor: d.valor }));

  const seis = ultimasCompetencias(comp, 6);
  const serieMes = seis.map((c) => {
    const d = calcularDRE(e, c);
    return { rotulo: competenciaCurta(c), valor: d.resultado, destaque: c === comp };
  });

  // 12 colunas: os ultimos 6 meses (este incluido) e os 6 seguintes. Contar o
  // mes corrente como um dos seis e' a mesma convencao do card "Resultado dos
  // ultimos 6 meses", logo abaixo — dois cards vizinhos com contagem diferente
  // confundiriam mais do que a coluna a mais ajudaria.
  const fluxo = fluxoCaixaMensal(e, { hoje, antes: 5, depois: 6 });

  const semVendas = Object.keys(e.vendas).length === 0;

  return `
  ${avisos(e, dre, receber, hoje)}

  <div class="grade grade-3 mb">
    ${kpi('Faturamento do mês', brl(dre.receitaBruta),
      `${dre.nVendas} ${dre.nVendas === 1 ? 'venda' : 'vendas'} · ${competenciaBR(comp)}`, 'destaque')}
    ${kpi('Resultado do mês', brl(dre.resultado),
      dre.margemLiquida === null ? 'sem vendas ainda' : 'margem líquida ' + pct(dre.margemLiquida),
      '')}
    ${kpi('Hoje', brl(receitaHoje), `${vendasHoje.length} ${vendasHoje.length === 1 ? 'venda' : 'vendas'}`)}
    ${kpi('A receber', brl(receber.total),
      receber.nVencidos ? `<span class="negativo">${receber.nVencidos} vencido(s): ${brl(receber.vencidos)}</span>`
        : `cartão ${brl(receber.cartao)} · fiado ${brl(receber.fiado)}`)}
    ${kpi('Ticket médio', brl(dre.ticketMedio), dre.itens ? num(dre.itens) + ' peças vendidas' : '')}
    ${kpi('Estoque', brl(estoque.custo), num(estoque.unidades) + ' peças a custo')}
  </div>

  ${mei.ativo ? `
  <div class="cartao">
    <div class="cartao-cabecalho"><h3>Teto do MEI — últimos 12 meses</h3>
      <span class="tag ${usoTeto >= 90 ? 'tag-erro' : usoTeto >= 70 ? 'tag-alerta' : 'tag-ok'}">${pct(usoTeto, 0)}</span></div>
    ${barra(usoTeto)}
    <div class="flex entre pequeno texto-2 mt">
      <span>${brl(acumulado12)} faturados</span>
      <span>teto ${brl(teto)}</span>
    </div>
    ${!mei.confirmado ? `<div class="dica" style="color:var(--ambar)">
      Confirme o teto e o valor do DAS vigentes em Ajustes — esses números mudam por lei e eu não invento valor de tributo.</div>` : ''}
    ${usoTeto >= 80 ? `<div class="aviso aviso-alerta mt">${icone('alerta')}<div>
      <strong>Atenção ao limite.</strong>Passar do teto obriga a migrar de regime e pagar a diferença. Vale conversar com a contabilidade antes de fechar o ano.</div></div>` : ''}
  </div>` : ''}

  ${semVendas ? `
  <div class="cartao">
    <div style="color:var(--roxo)">${icone('loja', 34)}</div>
    <h3 class="mt">Tudo pronto para começar</h3>
    <p class="texto-2">Cadastre as peças em <a href="#/estoque">Estoque</a>, dê entrada da compra e registre a primeira venda em <a href="#/vender">Vender</a>. A DRE se monta sozinha a partir daí.</p>
  </div>` : `
  <div class="cartao">
    <h3>Vendas do mês</h3>
    ${grafLinha(serieDia, { formato: (v) => brl(v).replace('R$ ', '') })}
  </div>

  ${fluxoMensalHTML(fluxo)}

  <div class="cartao">
    <h3>Resultado dos últimos 6 meses</h3>
    ${grafBarras(serieMes, { formato: (v) => brl(v).replace('R$ ', '') })}
    <p class="dica">Resultado é lucro (regime de competência). Caixa é o quadro acima — os dois só coincidem por acaso.</p>
  </div>`}

  <div class="grade grade-2">
    <div class="cartao">
      <div class="cartao-cabecalho"><h3>Repor estoque</h3>
        <button class="btn btn-p" data-ir="/estoque">Ver tudo</button></div>
      ${baixo.length ? `<div class="lista">${baixo.slice(0, 6).map((v) => `
        <div class="item" data-produto="${v.produtoId}">
          <div class="corpo"><div class="titulo">${esc(v.rotulo)}</div>
            <div class="sub">mínimo ${v.estoqueMinimo}</div></div>
          <div class="valor"><span class="tag ${v.saldo <= 0 ? 'tag-erro' : 'tag-alerta'}">${v.saldo}</span></div>
        </div>`).join('')}</div>`
        : '<p class="texto-3 pequeno">Nenhum item no limite. Estoque saudável.</p>'}
    </div>

    <div class="cartao">
      <div class="cartao-cabecalho"><h3>Últimas vendas</h3>
        <button class="btn btn-p" data-ir="/vendas">Ver todas</button></div>
      ${vendasMes.length ? `<div class="lista">${vendasMes.slice(0, 6).map((v) => `
        <div class="item" data-venda="${v.id}">
          <div class="corpo"><div class="titulo">#${v.numero} · ${esc(v.canalNome)}</div>
            <div class="sub">${dataBR(v.data)}${v.hora ? ' ' + v.hora : ''} · ${v.itens.reduce((s, i) => s + i.qtd, 0)} peças</div></div>
          <div class="valor">${brl(v.totais.liquido)}</div>
        </div>`).join('')}</div>`
        : '<p class="texto-3 pequeno">Nenhuma venda neste mês ainda.</p>'}
    </div>
  </div>`;
}

/**
 * Fluxo de caixa mes a mes: 12 colunas, os ultimos 6 meses e os 6 seguintes.
 * O passado e' o que aconteceu; o futuro e' so' o que ja' esta' contratado —
 * parcela com vencimento marcado e despesa lancada. Nada e' estimado por
 * semelhanca com o mes passado, e a nota no pe' diz isso em voz alta, porque
 * previsao de saida incompleta engana para o lado otimista.
 */
function fluxoMensalHTML(fluxo) {
  const meses = fluxo.meses;
  const serie = meses.map((m) => ({
    rotulo: competenciaCurta(m.comp), valor: m.saldo,
    destaque: m.corrente, previsto: m.futuro,
  }));
  const soma = (lista, campo) => lista.reduce((s, m) => s + m[campo], 0);
  const futuros = meses.filter((m) => m.futuro);
  const corrente = meses.find((m) => m.corrente);
  // "Realizado" conta so' o que ja' entrou e saiu de verdade — o previsto do mes
  // corrente fica de fora, senao o numero promete dinheiro que ainda nao chegou.
  const realizado = meses.filter((m) => !m.futuro).reduce((s, m) => s + m.entradas - m.saidas, 0);
  const cel = (v, classe) => `<td class="dir num ${classe || ''}">${v ? brl(v).replace('R$ ', '') : '—'}</td>`;

  return `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer"><h3>Fluxo de caixa mês a mês</h3>
        <div class="texto-2 pequeno">os últimos 6 meses e os 6 próximos · barra clara é previsão</div></div>
      <button class="btn btn-p" data-ir="/financeiro">Detalhar</button>
    </div>

    ${grafBarras(serie, { formato: (v) => brl(v).replace('R$ ', '') })}

    <div class="rolagem-x mt"><table>
      <thead><tr><th></th>
        ${meses.map((m) => `<th class="dir ${m.futuro ? 'texto-3' : ''}">${esc(competenciaCurta(m.comp))}${m.futuro || m.temPrevisto ? '*' : ''}</th>`).join('')}
      </tr></thead>
      <tbody>
        <tr><td class="texto-2">Entra</td>${meses.map((m) => cel(m.entradasTotal, 'positivo')).join('')}</tr>
        <tr><td class="texto-2">Sai</td>${meses.map((m) => cel(m.saidasTotal, 'negativo')).join('')}</tr>
        <tr><td class="negrito">Saldo</td>${meses.map((m) => cel(m.saldo, 'negrito' + (m.saldo < 0 ? ' negativo' : ''))).join('')}</tr>
      </tbody>
    </table></div>

    <div class="flex entre pequeno mt quebra gap-g">
      <span class="texto-2">Realizado até hoje
        <strong class="num ${realizado < 0 ? 'negativo' : ''}">${brl(realizado)}</strong></span>
      ${corrente && corrente.temPrevisto ? `<span class="texto-2">Ainda este mês · entra
        <strong class="num">${brl(corrente.entradasPrevistas)}</strong> · sai
        <strong class="num">${brl(corrente.saidasPrevistas)}</strong></span>` : ''}
      <span class="texto-2">Próximos 6 meses · entra
        <strong class="num">${brl(soma(futuros, 'entradasTotal'))}</strong> · sai
        <strong class="num">${brl(soma(futuros, 'saidasTotal'))}</strong></span>
    </div>

    <p class="dica">* Previsão: parcelas de cartão e de fiado com vencimento marcado, mais despesas já lançadas e ainda não pagas.
      Conta vencida e ainda em aberto aparece no mês atual, não no mês em que venceu.
      <strong>As despesas fixas dos meses à frente só entram depois de lançadas</strong> — enquanto você não usar
      "Repetir recorrentes" em <a href="#/despesas">Despesas</a>, a previsão de saída fica menor do que a realidade.</p>
  </div>`;
}

function avisos(e, dre, receber, hoje) {
  const lista = [];
  const semTaxa = (e.config.taxas || []).every((t) => !t.taxaPct);
  const temCartao = Object.values(e.recebiveis).some((r) => r.tipo === 'credito' || r.tipo === 'debito');

  if (semTaxa && temCartao) {
    lista.push(`<div class="aviso aviso-alerta">${icone('alerta')}<div>
      <strong>As taxas da maquininha estão zeradas.</strong>
      Enquanto ficarem assim, a DRE mostra margem maior do que a real e o valor a receber vem inflado.
      <a href="#/ajustes">Configurar agora</a></div></div>`);
  }
  if (e.config.mei && e.config.mei.ativo && !e.config.mei.confirmado) {
    lista.push(`<div class="aviso aviso-info">${icone('info')}<div>
      <strong>Confirme os valores do MEI.</strong>
      O DAS mensal e o teto anual mudam por lei — preencha os valores vigentes para a DRE e o medidor de teto ficarem corretos.
      <a href="#/ajustes">Ajustes</a></div></div>`);
  }
  if (receber.nVencidos) {
    lista.push(`<div class="aviso aviso-alerta">${icone('alerta')}<div>
      <strong>${receber.nVencidos} recebimento(s) vencido(s): ${brl(receber.vencidos)}.</strong>
      <a href="#/financeiro">Conferir no financeiro</a></div></div>`);
  }
  void dre; void hoje;
  return lista.join('');
}

function ligar(raiz) {
  liga(raiz, 'click', '[data-ir]', (ev, el) => irPara(el.dataset.ir));
  liga(raiz, 'click', '[data-produto]', (ev, el) => irPara('/produto/' + el.dataset.produto));
  liga(raiz, 'click', '[data-venda]', (ev, el) => irPara('/venda/' + el.dataset.venda));
}
