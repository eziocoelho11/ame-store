// graficos.js — SVG gerado a mao. Sem Chart.js, sem D3: um grafico de barras e
// um de linha nao justificam 300 KB de biblioteca que precisa de atualizacao.

import { esc, brl, num } from '../core/fmt.js';

const L = 46;  // margem esquerda (rotulos de valor)
const B = 22;  // margem inferior (rotulos do eixo x)
const T = 10;

const CEM_REAIS = 10000;  // dinheiro e' centavo inteiro: R$ 100,00 = 10000

/**
 * Passo da grade: sempre um multiplo redondo de R$ 100.
 * Dividir a altura do grafico em tres partes iguais dava linha em R$ 1.333,33 —
 * numero que ninguem le', so' suja o desenho. Aqui a escala se ajusta ao passo,
 * e nao o contrario.
 */
function passoBonito(amplitude, alvoLinhas = 4) {
  const desejado = Math.max(amplitude / alvoLinhas, CEM_REAIS);
  const decada = Math.pow(10, Math.floor(Math.log10(desejado)));
  // So' multiplicadores inteiros: com a decada valendo pelo menos R$ 100, o
  // passo continua sendo centena cheia (nada de R$ 250).
  for (const m of [1, 2, 5, 10]) {
    const p = m * decada;
    if (p >= desejado) return Math.max(Math.round(p / CEM_REAIS) * CEM_REAIS, CEM_REAIS);
  }
  return Math.max(Math.round(10 * decada / CEM_REAIS) * CEM_REAIS, CEM_REAIS);
}

function escala(maiorValor, menorValor = 0) {
  const alto = Math.max(maiorValor, 0);
  const baixo = Math.min(menorValor, 0);
  let passo = passoBonito((alto - baixo) || CEM_REAIS);
  let max = Math.ceil(alto / passo) * passo;
  let min = Math.floor(baixo / passo) * passo;
  if (max === min) max = min + passo;
  // Cinturao de seguranca: se sobrar linha demais, dobra o passo ate' caber.
  let guarda = 0;
  while ((max - min) / passo > 8 && guarda++ < 12) {
    passo *= 2;
    max = Math.ceil(alto / passo) * passo;
    min = Math.floor(baixo / passo) * passo;
  }
  return { max, min, passo };
}

/** Os valores onde a grade e' desenhada, do fundo para o topo. */
function linhasDaGrade({ min, max, passo }) {
  const out = [];
  for (let v = min; v <= max + passo / 1000; v += passo) out.push(Math.round(v));
  return out;
}

/** Rotulo do eixo: valor redondo nao precisa de centavo nem de "R$". */
function rotuloEixo(centavos) {
  return num(Math.round(centavos / 100));
}

/**
 * Barras verticais. dados = [{rotulo, valor, destaque?}]
 * `formato` recebe o valor em centavos e devolve texto.
 */
export function barras(dados, { altura = 190, formato = brl, largura = 640 } = {}) {
  if (!dados.length) return '';
  const valores = dados.map((d) => d.valor);
  const grade = escala(Math.max(0, ...valores), Math.min(0, ...valores));
  const { max, min } = grade;
  const h = altura - T - B;
  const w = largura - L - 8;
  const y = (v) => T + h - ((v - min) / (max - min || 1)) * h;
  const passoX = w / dados.length;
  const larguraBarra = Math.min(46, passoX * 0.62);

  let saida = `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" style="height:${altura}px">`;
  for (const v of linhasDaGrade(grade)) {
    const yy = y(v);
    saida += `<line class="grade-linha${v === 0 && min < 0 ? ' grade-zero' : ''}" x1="${L}" x2="${largura - 4}" y1="${yy}" y2="${yy}"/>`;
    saida += `<text x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${esc(rotuloEixo(v))}</text>`;
  }
  dados.forEach((d, i) => {
    const cx = L + passoX * i + passoX / 2;
    const y0 = y(0), y1 = y(d.valor);
    const topo = Math.min(y0, y1), alturaBarra = Math.max(1.5, Math.abs(y1 - y0));
    saida += `<rect class="barra-g${d.valor < 0 ? ' neg' : ''}" x="${cx - larguraBarra / 2}" y="${topo}" `
      + `width="${larguraBarra}" height="${alturaBarra}" rx="3"${d.destaque ? ' opacity="1"' : ' opacity=".82"'}>`
      + `<title>${esc(d.rotulo)}: ${esc(formato(d.valor))}</title></rect>`;
    if (dados.length <= 14 || i % 2 === 0) {
      saida += `<text x="${cx}" y="${altura - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
    }
  });
  saida += '</svg>';
  return saida;
}

/**
 * Varias linhas no mesmo par de eixos. series = [{nome, cor, dados:[{rotulo, valor}]}]
 * Todas as series dividem a mesma escala — e' o que permite comparar altura de
 * uma com altura de outra sem cair em conclusao errada.
 *
 * `solidoAte` e' o indice do ultimo ponto que ja' aconteceu: dali para a frente
 * a linha vira tracejada. Previsao desenhada igual ao realizado vira promessa.
 */
export function linhas(series, { altura = 210, formato = brl, largura = 640, solidoAte = null } = {}) {
  const pontos = series[0] ? series[0].dados.length : 0;
  if (!pontos) return '';
  const todos = series.flatMap((s) => s.dados.map((d) => d.valor));
  const grade = escala(Math.max(0, ...todos), Math.min(0, ...todos));
  const { max, min } = grade;
  const h = altura - T - B;
  const w = largura - L - 8;
  const y = (v) => T + h - ((v - min) / (max - min || 1)) * h;
  const x = (i) => (pontos === 1 ? L + w / 2 : L + (w / (pontos - 1)) * i);

  let saida = `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" style="height:${altura}px">`;
  // A linha do zero sai mais marcada: separa o mes que sobrou do que faltou.
  for (const v of linhasDaGrade(grade)) {
    const yy = y(v);
    saida += `<line class="grade-linha${v === 0 && min < 0 ? ' grade-zero' : ''}" x1="${L}" x2="${largura - 4}" y1="${yy}" y2="${yy}"/>`;
    saida += `<text x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${esc(rotuloEixo(v))}</text>`;
  }

  const corte = solidoAte === null ? pontos - 1 : Math.max(0, Math.min(pontos - 1, solidoAte));
  for (const s of series) {
    const p = (i) => `${x(i)},${y(s.dados[i].valor)}`;
    const cheio = [];
    for (let i = 0; i <= corte; i++) cheio.push(p(i));
    const tracejado = [];
    for (let i = corte; i < pontos; i++) tracejado.push(p(i));
    if (cheio.length > 1) {
      saida += `<polyline class="linha-g" style="stroke:${s.cor}" points="${cheio.join(' ')}"/>`;
    }
    if (tracejado.length > 1) {
      saida += `<polyline class="linha-g" style="stroke:${s.cor}" stroke-dasharray="6 4" opacity=".75" points="${tracejado.join(' ')}"/>`;
    }
    s.dados.forEach((d, i) => {
      saida += `<circle class="ponto-g" style="fill:${s.cor}" cx="${x(i)}" cy="${y(d.valor)}" r="${i <= corte ? 3 : 2.6}"`
        + `${i > corte ? ' opacity=".75"' : ''}>`
        + `<title>${esc(d.rotulo)} · ${esc(s.nome)}: ${esc(formato(d.valor))}${i > corte ? ' (previsto)' : ''}</title></circle>`;
    });
  }
  series[0].dados.forEach((d, i) => {
    if (pontos <= 14 || i % Math.ceil(pontos / 8) === 0) {
      saida += `<text x="${x(i)}" y="${altura - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
    }
  });
  saida += '</svg>';
  const legenda = series.map((s) => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('');
  return saida + `<div class="legenda">${legenda}</div>`;
}

const CORES = ['#7442B8', '#B98BEC', '#1C7A57', '#C99A2E', '#1F5FA8', '#B3261E', '#8E7CC3', '#5BC79A'];

/** Rosca com legenda. dados = [{rotulo, valor}] */
export function rosca(dados, { tamanho = 168, formato = brl } = {}) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) return '<p class="texto-3 pequeno">Sem dados no período.</p>';
  const r = tamanho / 2 - 6;
  const c = tamanho / 2;
  const espessura = 26;
  let angulo = -Math.PI / 2;
  let saida = `<svg class="grafico" viewBox="0 0 ${tamanho} ${tamanho}" style="max-width:${tamanho}px;height:${tamanho}px">`;
  dados.forEach((d, i) => {
    const fatia = (d.valor / total) * Math.PI * 2;
    if (fatia <= 0) return;
    const fim = angulo + fatia;
    const grande = fatia > Math.PI ? 1 : 0;
    const p = (ang, raio) => `${c + Math.cos(ang) * raio} ${c + Math.sin(ang) * raio}`;
    const ri = r - espessura;
    saida += `<path d="M ${p(angulo, r)} A ${r} ${r} 0 ${grande} 1 ${p(fim, r)} L ${p(fim, ri)} A ${ri} ${ri} 0 ${grande} 0 ${p(angulo, ri)} Z" `
      + `fill="${CORES[i % CORES.length]}"><title>${esc(d.rotulo)}: ${esc(formato(d.valor))}</title></path>`;
    angulo = fim;
  });
  saida += '</svg>';
  const legenda = dados.filter((d) => d.valor > 0).map((d, i) =>
    `<span><i style="background:${CORES[i % CORES.length]}"></i>${esc(d.rotulo)} · ${esc(formato(d.valor))}</span>`).join('');
  return `<div class="flex centro gap-g quebra">${saida}<div class="legenda" style="flex-direction:column;gap:.35rem">${legenda}</div></div>`;
}

/** Barras horizontais para rankings. */
export function ranking(dados, { formato = brl, limite = 8 } = {}) {
  const lista = dados.slice(0, limite);
  if (!lista.length) return '<p class="texto-3 pequeno">Sem dados no período.</p>';
  const max = Math.max(...lista.map((d) => d.valor), 1);
  return '<div class="lista">' + lista.map((d) => `
    <div style="padding:.45rem 0">
      <div class="flex entre pequeno" style="margin-bottom:.2rem">
        <span class="truncar" style="max-width:65%">${esc(d.rotulo)}</span>
        <span class="negrito num">${esc(formato(d.valor))}</span>
      </div>
      <div class="barra"><span style="width:${(d.valor / max) * 100}%;background:var(--roxo)"></span></div>
    </div>`).join('') + '</div>';
}
