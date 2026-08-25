// barras.js — codigo de barras EAN-13: gerar (etiqueta) e ler (camera).
//
// Ler pela camera tem dois caminhos:
//  1. BarcodeDetector nativo — Android/Chrome/Edge. Rapido e preciso.
//  2. Decodificador proprio — o Safari do iPhone NAO tem BarcodeDetector, e
//     depender de biblioteca externa criaria a dependencia que este projeto
//     evita. Entao a leitura de linha de varredura esta' escrita aqui.
//     Funciona porque as etiquetas sao nossas, EAN-13 impresso limpo.

import { abrirModal, toast } from './ui.js';
import { esc } from '../core/fmt.js';

// Larguras (em modulos) dos 4 traços de cada digito, codigo L.
const L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'];
const G = L.map((s) => s.split('').reverse().join(''));
const PARIDADE = ['000000', '001011', '001101', '001110', '010011', '011001', '011100', '010101', '010110', '011010'];

// ---------------- gerar ----------------

const BITS_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const BITS_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const BITS_R = BITS_L.map((b) => b.split('').map((c) => (c === '0' ? '1' : '0')).join(''));

/** Devolve os 95 modulos do codigo como string de bits. */
export function bitsEAN13(codigo) {
  const c = String(codigo).replace(/\D/g, '');
  if (c.length !== 13) return null;
  const primeiro = Number(c[0]);
  const par = PARIDADE[primeiro];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === '0' ? BITS_L : BITS_G)[Number(c[i])];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += BITS_R[Number(c[i])];
  bits += '101';
  return bits;
}

/** SVG do codigo de barras, pronto para imprimir na etiqueta. */
export function svgEAN13(codigo, { altura = 42, larguraModulo = 1.6, mostrarNumero = true } = {}) {
  const bits = bitsEAN13(codigo);
  if (!bits) return `<span class="mono">${esc(codigo)}</span>`;
  const margem = 6 * larguraModulo;
  const largura = bits.length * larguraModulo + margem * 2;
  const alturaTotal = altura + (mostrarNumero ? 12 : 0);
  let barras = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let fim = i;
      while (fim < bits.length && bits[fim] === '1') fim++;
      // As barras de guarda descem um pouco mais, como no padrao impresso.
      const guarda = (i <= 2) || (i >= 45 && i <= 49) || (i >= 92);
      barras += `<rect x="${margem + i * larguraModulo}" y="0" width="${(fim - i) * larguraModulo}" `
        + `height="${altura + (guarda && mostrarNumero ? 6 : 0)}" fill="#000"/>`;
      i = fim;
    } else i++;
  }
  const c = String(codigo);
  const texto = mostrarNumero
    ? `<text x="${margem - 1}" y="${alturaTotal - 1}" font-size="9" text-anchor="end" font-family="monospace">${c[0]}</text>`
    + `<text x="${margem + 24 * larguraModulo}" y="${alturaTotal - 1}" font-size="9" text-anchor="middle" font-family="monospace">${c.slice(1, 7)}</text>`
    + `<text x="${margem + 67 * larguraModulo}" y="${alturaTotal - 1}" font-size="9" text-anchor="middle" font-family="monospace">${c.slice(7)}</text>`
    : '';
  return `<svg viewBox="0 0 ${largura} ${alturaTotal}" width="${largura}" height="${alturaTotal}" style="max-width:100%">`
    + `<rect width="${largura}" height="${alturaTotal}" fill="#fff"/>${barras}${texto}</svg>`;
}

// ---------------- decodificador proprio (linha de varredura) ----------------

/** Converte uma linha de pixels em corridas de preto/branco. */
function corridas(luminancia) {
  const n = luminancia.length;
  let min = 255, max = 0;
  for (let i = 0; i < n; i++) { if (luminancia[i] < min) min = luminancia[i]; if (luminancia[i] > max) max = luminancia[i]; }
  if (max - min < 40) return null;           // linha sem contraste: nao ha' codigo aqui
  const limite = (min + max) / 2;

  const saida = [];
  let corAtual = luminancia[0] < limite ? 1 : 0;  // 1 = preto
  let inicio = 0;
  for (let i = 1; i < n; i++) {
    const cor = luminancia[i] < limite ? 1 : 0;
    if (cor !== corAtual) { saida.push({ cor: corAtual, tam: i - inicio }); corAtual = cor; inicio = i; }
  }
  saida.push({ cor: corAtual, tam: n - inicio });
  return saida;
}

/** 4 corridas -> digito. Devolve {digito, tipo:'L'|'G'} ou null. */
function digitoDe(quatro, modulo) {
  const total = quatro.reduce((s, r) => s + r, 0);
  const unidade = total / 7;
  if (unidade < modulo * 0.55 || unidade > modulo * 1.8) return null;
  const norm = quatro.map((r) => Math.max(1, Math.round(r / unidade)));
  if (norm.reduce((s, v) => s + v, 0) !== 7) return null;
  const chave = norm.join('');
  const iL = L.indexOf(chave);
  if (iL >= 0) return { digito: iL, tipo: 'L' };
  const iG = G.indexOf(chave);
  if (iG >= 0) return { digito: iG, tipo: 'G' };
  return null;
}

/** Tenta ler um EAN-13 a partir das corridas de uma linha. */
function lerLinha(rs) {
  if (!rs || rs.length < 59) return null;
  for (let i = 0; i + 59 <= rs.length; i++) {
    if (rs[i].cor !== 1) continue;                     // guarda comeca com barra preta
    const janela = rs.slice(i, i + 59);
    const totalModulos = janela.reduce((s, r) => s + r.tam, 0);
    const modulo = totalModulos / 95;
    if (modulo < 0.8) continue;

    // Guardas: 1 modulo cada, com folga de 40%.
    const guardaOk = (a, b, c) => [a, b, c].every((r) => Math.abs(r.tam - modulo) < modulo * 0.6);
    if (!guardaOk(janela[0], janela[1], janela[2])) continue;

    const digitos = [];
    let paridade = '';
    let ok = true;

    // 6 digitos da esquerda: corridas 3..26
    for (let d = 0; d < 6 && ok; d++) {
      const base = 3 + d * 4;
      const r = digitoDe(janela.slice(base, base + 4).map((x) => x.tam), modulo);
      if (!r) { ok = false; break; }
      digitos.push(r.digito);
      paridade += r.tipo === 'L' ? '0' : '1';
    }
    if (!ok) continue;

    // guarda central: corridas 27..31
    const central = janela.slice(27, 32);
    if (!central.every((r) => Math.abs(r.tam - modulo) < modulo * 0.7)) continue;

    // 6 digitos da direita: corridas 32..55
    for (let d = 0; d < 6 && ok; d++) {
      const base = 32 + d * 4;
      const r = digitoDe(janela.slice(base, base + 4).map((x) => x.tam), modulo);
      if (!r) { ok = false; break; }
      digitos.push(r.digito);
    }
    if (!ok) continue;

    const primeiro = PARIDADE.indexOf(paridade);
    if (primeiro < 0) continue;

    const codigo = String(primeiro) + digitos.join('');
    if (codigo.length !== 13) continue;
    let soma = 0;
    for (let k = 0; k < 12; k++) soma += Number(codigo[k]) * (k % 2 === 0 ? 1 : 3);
    if (String((10 - (soma % 10)) % 10) !== codigo[12]) continue;   // digito verificador
    return codigo;
  }
  return null;
}

/** Varre o quadro em varias alturas — a etiqueta raramente esta' centralizada. */
export function decodificarQuadro(imageData) {
  const { data, width, height } = imageData;
  const linhas = 14;
  for (let k = 1; k <= linhas; k++) {
    const y = Math.floor((height * k) / (linhas + 1));
    const lum = new Uint8Array(width);
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const p = base + x * 4;
      lum[x] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }
    const codigo = lerLinha(corridas(lum));
    if (codigo) return codigo;
  }
  return null;
}

// ---------------- camera ----------------

/**
 * Abre a camera e devolve o codigo lido (ou null se o usuario desistir).
 * Sempre oferece digitacao manual: leitura por camera erra com etiqueta
 * amassada ou luz ruim, e o balcao nao pode travar por causa disso.
 */
export function lerCodigoDeBarras() {
  return new Promise((resolve, reject) => {
    let fluxo = null;
    let parar = false;
    let resolvido = false;

    const corpo = `
      <div style="position:relative;background:#000;border-radius:12px;overflow:hidden;aspect-ratio:4/3">
        <video id="bc-video" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover"></video>
        <div style="position:absolute;inset:18% 8%;border:2px solid rgba(255,255,255,.9);border-radius:8px;
             box-shadow:0 0 0 100vmax rgba(0,0,0,.35)"></div>
      </div>
      <p class="dica mt" id="bc-status">Aponte para o código de barras da etiqueta.</p>
      <div class="campo-grupo mt">
        <label for="bc-manual">Ou digite o código</label>
        <input id="bc-manual" inputmode="numeric" placeholder="789...">
      </div>`;

    const terminar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      parar = true;
      if (fluxo) fluxo.getTracks().forEach((t) => t.stop());
      resolve(valor);
    };

    const m = abrirModal({
      titulo: 'Ler código de barras',
      corpo,
      botoes: [
        { texto: 'Cancelar', acao: (f) => { terminar(null); f(); } },
        {
          texto: 'Usar código digitado', classe: 'btn-primario',
          acao: (f, raiz) => {
            const v = raiz.querySelector('#bc-manual').value.trim();
            if (!v) { toast('Digite o código ou aponte a câmera.', 'erro'); return; }
            terminar(v); f();
          },
        },
      ],
      aoFechar: () => terminar(null),
    });

    const raiz = m.el;
    const video = raiz.querySelector('#bc-video');
    const status = raiz.querySelector('#bc-status');

    const achou = (codigo) => {
      terminar(codigo);
      const btn = raiz.querySelector('[data-fechar]');
      if (btn) btn.click();
    };

    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        status.textContent = 'Este navegador não dá acesso à câmera. Digite o código abaixo.';
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false,
        });
      } catch (err) {
        status.textContent = 'Não consegui abrir a câmera (' + (err.name || 'erro') + '). Digite o código abaixo.';
        return;
      }
      video.srcObject = fluxo;
      try { await video.play(); } catch { /* autoplay bloqueado: o usuario toca no video */ }

      if ('BarcodeDetector' in window) {
        try {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a'] });
          status.textContent = 'Lendo…';
          const laco = async () => {
            if (parar) return;
            try {
              const achados = await det.detect(video);
              if (achados && achados.length) return achou(achados[0].rawValue);
            } catch { /* quadro ruim, tenta o proximo */ }
            requestAnimationFrame(laco);
          };
          laco();
          return;
        } catch { /* detector indisponivel: cai no decodificador proprio */ }
      }

      status.textContent = 'Lendo (modo compatível — mantenha a etiqueta reta e bem iluminada)…';
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const laco = () => {
        if (parar) return;
        if (video.videoWidth) {
          const escala = Math.min(1, 900 / video.videoWidth);
          canvas.width = Math.floor(video.videoWidth * escala);
          canvas.height = Math.floor(video.videoHeight * escala);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const codigo = decodificarQuadro(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (codigo) return achou(codigo);
          } catch { /* ignora quadro ruim */ }
        }
        setTimeout(laco, 90);
      };
      laco();
    })().catch(reject);
  });
}
