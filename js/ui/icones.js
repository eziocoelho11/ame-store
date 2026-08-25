// icones.js — SVG desenhado a mao, inline. Sem pacote de icones, sem CDN.
const D = {
  casa: 'M3 10.6 12 3.2l9 7.4M5.4 9.4V20.8h13.2V9.4',
  carrinho: 'M2.5 3.5h2.4l2.5 12.2a1.8 1.8 0 0 0 1.8 1.4h8.4a1.8 1.8 0 0 0 1.8-1.4L21 7.6H5.6',
  caixa: 'M21 7.8v8.4L12 21l-9-4.8V7.8L12 3zM3.3 7.6 12 12.3l8.7-4.7M12 12.3V21',
  dinheiro: 'M3 6.5h18v11H3zM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M6.3 9.6h.01M17.7 14.4h.01',
  grafico: 'M4 20.5V11M9.3 20.5V4.5M14.7 20.5v-6M20 20.5V8.5',
  pessoas: 'M9 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8M2.6 20.4c0-3.8 2.9-5.8 6.4-5.8s6.4 2 6.4 5.8M17 10.6a2.8 2.8 0 1 0 0-5.6M18 14.8c2.4.5 3.6 2.3 3.6 5.6',
  recibo: 'M6.2 2.5h11.6v19l-2.9-1.9-2.9 1.9-2.9-1.9-2.9 1.9zM9.4 7.6h5.2M9.4 11.4h5.2M9.4 15.2h3.2',
  ajustes: 'M3.5 6.5h16M3.5 12h16M3.5 17.5h16',
  ajustesPontos: 'M9 6.5a1.9 1.9 0 1 0 0-.02M15.5 12a1.9 1.9 0 1 0 0-.02M8 17.5a1.9 1.9 0 1 0 0-.02',
  mais: 'M12 5.2v13.6M5.2 12h13.6',
  menos: 'M5.2 12h13.6',
  reticencias: 'M5.2 12h.01M12 12h.01M18.8 12h.01',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20.5 20.5 16 16',
  fechar: 'M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8',
  lixeira: 'M3.8 6.6h16.4M9.2 6.6V4.2h5.6v2.4M6.2 6.6 7.4 20.4h9.2L17.8 6.6',
  editar: 'M4 20.2h4.2L20 8.4 15.8 4.2 4 16z',
  voltar: 'M15 4.8 7.8 12 15 19.2',
  avancar: 'M9 4.8 16.2 12 9 19.2',
  cima: 'M4.8 15 12 7.8 19.2 15',
  baixo: 'M4.8 9 12 16.2 19.2 9',
  alerta: 'M12 3.2 2.2 20.6h19.6zM12 10v4.4M12 17.6h.01',
  check: 'M4.5 12.4 9.4 17.4 19.6 6.6',
  checkCirculo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.2 12.2l2.6 2.6 5-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.4M12 7.8h.01',
  sincronizar: 'M20.4 11.2A8.4 8.4 0 0 0 6 6.4L3.6 8.8M3.6 12.8a8.4 8.4 0 0 0 14.4 4.8l2.4-2.4M3.6 4.6v4.2h4.2M20.4 19.4v-4.2h-4.2',
  camera: 'M3 7.6h3.8L8.2 5.2h7.6l1.4 2.4H21v12.8H3zM12 17.4a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2',
  imprimir: 'M6.4 9.2V3.4h11.2v5.8M6.4 18.4H3.8v-7.6h16.4v7.6h-2.6M7.6 14.4h8.8v6.2H7.6z',
  baixar: 'M12 3.4v11.8M7.4 10.8 12 15.4l4.6-4.6M4 20.6h16',
  enviar: 'M12 20.6V8.8M7.4 13.4 12 8.8l4.6 4.6M4 3.4h16',
  calendario: 'M4 6.4h16v14.2H4zM4 10.6h16M8.4 3.4v4.2M15.6 3.4v4.2',
  etiqueta: 'M20.6 12.6 12.6 20.6 3.4 11.4V3.4h8zM7.8 8a.9.9 0 1 0 0-.02',
  documento: 'M6.2 2.6h8L19 7.4v14H6.2zM14 2.6v5h5M9 13h6M9 16.6h6',
  filtro: 'M3.4 5h17.2l-6.6 7.8v6.4l-4 2v-8.4z',
  olho: 'M2 12s3.8-6.6 10-6.6S22 12 22 12s-3.8 6.6-10 6.6S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  nuvem: 'M7 18.6h10.2a4.2 4.2 0 0 0 .5-8.4 6.3 6.3 0 0 0-12.2 1.7A3.6 3.6 0 0 0 7 18.6',
  cadeado: 'M5.6 10.6h12.8v10H5.6zM8.4 10.6V7.4a3.6 3.6 0 0 1 7.2 0v3.2',
  raio: 'M13.4 2.6 4.8 13.4h5.6l-.8 8 8.6-10.8h-5.6z',
  loja: 'M3.4 8.6 5 3.4h14l1.6 5.2a3 3 0 0 1-5.8 1 3 3 0 0 1-5.6 0 3 3 0 0 1-5.8-1M4.6 10.8v9.8h14.8v-9.8',
};

/** icone('casa') -> string SVG pronta para interpolar em HTML. */
export function icone(nome, tamanho) {
  const d = D[nome] || D.info;
  const t = tamanho ? ` width="${tamanho}" height="${tamanho}"` : '';
  return `<svg${t} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export const nomesDeIcone = Object.keys(D);
