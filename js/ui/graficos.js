// graficos.js — SVG gerado a mao. Sem Chart.js, sem D3: um grafico de barras e
// um de linha nao justificam 300 KB de biblioteca que precisa de atualizacao.

import { esc, brl } from '../core/fmt.js';

const L = 46;  // margem esquerda (rotulos de valor)
const B = 22;  // margem inferior (rotulos do eixo x)
const T = 10;

function escala(max, min = 0) {
  if (max === min) return { max: max || 1, min: min || 0 };
  const amplitude = max - min;
  const passo = Math.pow(10, Math.floor(Math.log10(amplitude || 1)));
  const arredonda = (v, cima) => (cima ? Math.ceil(v / passo) : Math.floor(v / passo)) * passo;
  return { max: arredonda(max, true), min: min < 0 ? arredonda(min, false) : 0 };
}

/**
 * Barras verticais. dados = [{rotulo, valor, destaque?}]
 * `formato` recebe o valor em centavos e devolve texto.
 */
export function barras(dados, { altura = 190, formato = brl, largura = 640 } = {}) {
  if (!dados.length) return '';
  const valores = dados.map((d) => d.valor);
  const { max, min } = escala(Math.max(0, ...valores), Math.min(0, ...valores));
  const h = altura - T - B;
  const w = largura - L - 8;
  const y = (v) => T + h - ((v - min) / (max - min || 1)) * h;
  const passoX = w / dados.length;
  const larguraBarra = Math.min(46, passoX * 0.62);

  let saida = `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" style="height:${altura}px">`;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    const yy = y(v);
    saida += `<line class="grade-linha" x1="${L}" x2="${largura - 4}" y1="${yy}" y2="${yy}"/>`;
    saida += `<text x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${esc(formato(v))}</text>`;
  }
  dados.forEach((d, i) => {
    const cx = L + passoX * i + passoX / 2;
    const y0 = y(0), y1 = y(d.valor);
    const topo = Math.min(y0, y1), alturaBarra = Math.max(1.5, Math.abs(y1 - y0));
    // Barra de valor previsto vem mais apagada: o olho precisa separar num a
    // hora o que ja' aconteceu do que ainda pode nao acontecer.
    const opacidade = d.destaque ? '1' : d.previsto ? '.42' : '.82';
    saida += `<rect class="barra-g${d.valor < 0 ? ' neg' : ''}" x="${cx - larguraBarra / 2}" y="${topo}" `
      + `width="${larguraBarra}" height="${alturaBarra}" rx="3" opacity="${opacidade}">`
      + `<title>${esc(d.rotulo)}: ${esc(formato(d.valor))}${d.previsto ? ' (previsto)' : ''}</title></rect>`;
    if (dados.length <= 14 || i % 2 === 0) {
      saida += `<text x="${cx}" y="${altura - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
    }
  });
  saida += '</svg>';
  return saida;
}

/** Linha com area. dados = [{rotulo, valor}] */
export function linha(dados, { altura = 180, formato = brl, largura = 640, marcarPontos = false } = {}) {
  if (dados.length < 2) return barras(dados, { altura, formato, largura });
  const valores = dados.map((d) => d.valor);
  const { max, min } = escala(Math.max(...valores), Math.min(0, ...valores));
  const h = altura - T - B;
  const w = largura - L - 8;
  const y = (v) => T + h - ((v - min) / (max - min || 1)) * h;
  const x = (i) => L + (w / (dados.length - 1)) * i;

  let saida = `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" style="height:${altura}px">`;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    const yy = y(v);
    saida += `<line class="grade-linha" x1="${L}" x2="${largura - 4}" y1="${yy}" y2="${yy}"/>`;
    saida += `<text x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${esc(formato(v))}</text>`;
  }
  const pontos = dados.map((d, i) => `${x(i)},${y(d.valor)}`).join(' ');
  saida += `<polygon class="area-g" points="${L},${y(min)} ${pontos} ${x(dados.length - 1)},${y(min)}"/>`;
  saida += `<polyline class="linha-g" points="${pontos}"/>`;
  dados.forEach((d, i) => {
    if (marcarPontos || dados.length <= 14) {
      saida += `<circle class="ponto-g" cx="${x(i)}" cy="${y(d.valor)}" r="3"><title>${esc(d.rotulo)}: ${esc(formato(d.valor))}</title></circle>`;
    }
    if (dados.length <= 14 || i % Math.ceil(dados.length / 8) === 0) {
      saida += `<text x="${x(i)}" y="${altura - 6}" text-anchor="middle">${esc(d.rotulo)}</text>`;
    }
  });
  saida += '</svg>';
  return saida;
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
