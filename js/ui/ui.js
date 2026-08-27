// ui.js — pecas de interface reutilizadas por todas as telas.
import { icone } from './icones.js';
import { esc, brl } from '../core/fmt.js';

// ---------------- avisos flutuantes ----------------

let caixaToasts = null;

export function toast(mensagem, tipo = '') {
  if (!caixaToasts) {
    caixaToasts = document.createElement('div');
    caixaToasts.className = 'toasts';
    document.body.appendChild(caixaToasts);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  const ic = tipo === 'ok' ? 'check' : tipo === 'erro' ? 'alerta' : '';
  el.innerHTML = (ic ? icone(ic, 16) : '') + '<span>' + esc(mensagem) + '</span>';
  caixaToasts.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, tipo === 'erro' ? 4800 : 2600);
}

// ---------------- modal ----------------

let modaisAbertos = [];

/**
 * abrirModal({titulo, corpo, botoes, largo, aoAbrir})
 * `botoes` = [{texto, classe, acao(fechar) }]. `corpo` e' HTML em string.
 * Devolve { el, fechar }.
 */
export function abrirModal({ titulo, corpo, botoes = [], largo = false, aoAbrir = null, aoFechar = null }) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo-modal';
  fundo.innerHTML = `
    <div class="modal${largo ? ' largo' : ''}" role="dialog" aria-modal="true">
      <div class="modal-topo">
        <h2>${esc(titulo)}</h2>
        <button class="btn btn-icone btn-fantasma" data-fechar aria-label="Fechar">${icone('fechar')}</button>
      </div>
      <div class="modal-corpo">${corpo}</div>
      ${botoes.length ? '<div class="modal-rodape"></div>' : ''}
    </div>`;

  const fechar = (resultado) => {
    const i = modaisAbertos.indexOf(fundo);
    if (i >= 0) modaisAbertos.splice(i, 1);
    fundo.remove();
    if (!modaisAbertos.length) document.body.style.overflow = '';
    if (aoFechar) aoFechar(resultado);
  };

  const rodape = fundo.querySelector('.modal-rodape');
  if (rodape) {
    for (const b of botoes) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.classe || '');
      btn.innerHTML = (b.icone ? icone(b.icone, 16) : '') + '<span>' + esc(b.texto) + '</span>';
      btn.onclick = () => b.acao ? b.acao(fechar, fundo) : fechar();
      if (b.id) btn.dataset.id = b.id;
      rodape.appendChild(btn);
    }
  }

  fundo.querySelector('[data-fechar]').onclick = () => fechar();
  fundo.addEventListener('mousedown', (ev) => { if (ev.target === fundo) fechar(); });

  document.body.appendChild(fundo);
  document.body.style.overflow = 'hidden';
  modaisAbertos.push(fundo);
  if (aoAbrir) aoAbrir(fundo, fechar);
  const primeiro = fundo.querySelector('input:not([type=hidden]), select, textarea');
  if (primeiro && window.matchMedia('(min-width: 900px)').matches) primeiro.focus();
  return { el: fundo, fechar };
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && modaisAbertos.length) {
    const topo = modaisAbertos[modaisAbertos.length - 1];
    const btn = topo.querySelector('[data-fechar]');
    if (btn) btn.click();
  }
});

/** Confirmacao. Devolve Promise<boolean>. */
export function confirmar(titulo, texto, { textoOk = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let respondeu = false;
    abrirModal({
      titulo,
      corpo: `<p>${texto}</p>`,
      botoes: [
        { texto: 'Cancelar', acao: (f) => { respondeu = true; f(); resolve(false); } },
        { texto: textoOk, classe: perigo ? 'btn-perigo' : 'btn-primario', acao: (f) => { respondeu = true; f(); resolve(true); } },
      ],
      aoFechar: () => { if (!respondeu) resolve(false); },
    });
  });
}

// ---------------- formulario generico ----------------

/**
 * Descreve um campo: { nome, rotulo, tipo, opcoes, obrigatorio, dica, meia, valor, attrs }
 * tipos: texto | moeda | numero | inteiro | pct | data | select | textarea | checkbox | oculto | separador
 */
export function campoHTML(c, valor) {
  const v = valor === undefined || valor === null ? (c.valor === undefined ? '' : c.valor) : valor;
  const req = c.obrigatorio ? ' required' : '';
  const attrs = c.attrs || '';
  const id = 'c_' + c.nome;
  let entrada = '';

  switch (c.tipo) {
    case 'oculto':
      return `<input type="hidden" name="${c.nome}" value="${esc(v)}">`;
    case 'separador':
      return `<h3 class="mt" style="font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--texto-3)">${esc(c.rotulo)}</h3>`;
    case 'moeda':
      entrada = `<input id="${id}" name="${c.nome}" inputmode="decimal" data-moeda value="${v === '' ? '' : brlSemSimbolo(v)}" placeholder="0,00"${req} ${attrs}>`;
      break;
    case 'pct':
      entrada = `<input id="${id}" name="${c.nome}" inputmode="decimal" data-pct value="${v === '' ? '' : String(v).replace('.', ',')}" placeholder="0,00"${req} ${attrs}>`;
      break;
    case 'inteiro':
      entrada = `<input id="${id}" name="${c.nome}" type="number" step="1" inputmode="numeric" value="${esc(v)}"${req} ${attrs}>`;
      break;
    case 'numero':
      entrada = `<input id="${id}" name="${c.nome}" type="number" step="any" inputmode="decimal" value="${esc(v)}"${req} ${attrs}>`;
      break;
    case 'data':
      entrada = `<input id="${id}" name="${c.nome}" type="date" value="${esc(v)}"${req} ${attrs}>`;
      break;
    case 'textarea':
      entrada = `<textarea id="${id}" name="${c.nome}"${req} ${attrs}>${esc(v)}</textarea>`;
      break;
    case 'checkbox':
      return `<div class="campo-grupo"><label class="checkbox-linha">
        <input type="checkbox" name="${c.nome}" ${v ? 'checked' : ''} ${attrs}>
        <span>${esc(c.rotulo)}</span></label>
        ${c.dica ? `<div class="dica">${esc(c.dica)}</div>` : ''}</div>`;
    case 'select': {
      const opts = (c.opcoes || []).map((o) => {
        const val = typeof o === 'string' ? o : o.v;
        const txt = typeof o === 'string' ? o : o.t;
        return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(txt)}</option>`;
      }).join('');
      entrada = `<select id="${id}" name="${c.nome}"${req} ${attrs}>${opts}</select>`;
      break;
    }
    default:
      entrada = `<input id="${id}" name="${c.nome}" type="text" value="${esc(v)}"${req} ${attrs}>`;
  }

  return `<div class="campo-grupo"${c.meia ? '' : ''}>
    <label for="${id}">${esc(c.rotulo)}${c.obrigatorio ? ' *' : ''}</label>
    ${entrada}
    ${c.dica ? `<div class="dica">${esc(c.dica)}</div>` : ''}
  </div>`;
}

function brlSemSimbolo(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/** Monta os campos em HTML, agrupando os marcados como `meia` em pares. */
export function formularioHTML(campos, valores = {}) {
  let saida = '';
  let buffer = [];
  const despeja = () => {
    if (!buffer.length) return;
    saida += buffer.length === 1 ? buffer[0] : `<div class="linha">${buffer.join('')}</div>`;
    buffer = [];
  };
  for (const c of campos) {
    const html = campoHTML(c, valores[c.nome]);
    if (c.meia) { buffer.push(html); if (buffer.length === 2) despeja(); }
    else { despeja(); saida += html; }
  }
  despeja();
  return `<form data-form novalidate>${saida}</form>`;
}

/** Le um <form> devolvendo objeto com moeda em centavos e pct em numero. */
export function lerFormulario(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.dataset.moeda !== undefined) out[el.name] = paraCent(el.value);
    else if (el.dataset.pct !== undefined) out[el.name] = parseFloat(String(el.value).replace(',', '.')) || 0;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim();
  }
  return out;
}

function paraCent(texto) {
  if (!texto) return 0;
  let s = String(texto).replace(/[^\d,.-]/g, '');
  const tv = s.includes(','), tp = s.includes('.');
  if (tv && tp) s = s.replace(/\./g, '').replace(',', '.');
  else if (tv) s = s.replace(',', '.');
  else if (tp) { const p = s.split('.'); if (p[p.length - 1].length === 3) s = p.join(''); }
  const v = parseFloat(s);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

/**
 * Abre um modal com formulario. `aoSalvar(valores, fechar, form)` pode ser async.
 * Devolve o handle do modal.
 */
export function modalFormulario({ titulo, campos, valores = {}, textoOk = 'Salvar', largo = false, extras = '', aoSalvar, botoesExtras = [] }) {
  return abrirModal({
    titulo, largo,
    corpo: formularioHTML(campos, valores) + extras,
    botoes: [
      ...botoesExtras,
      { texto: 'Cancelar', acao: (f) => f() },
      {
        texto: textoOk, classe: 'btn-primario',
        acao: async (fechar, raiz) => {
          const form = raiz.querySelector('form[data-form]');
          if (!validar(form)) return;
          const dados = lerFormulario(form);
          try { await aoSalvar(dados, fechar, form, raiz); }
          catch (err) { console.error(err); toast(err.message || 'Não consegui salvar.', 'erro'); }
        },
      },
    ],
  });
}

/** Validacao simples de obrigatorios, marcando o campo em vermelho. */
export function validar(form) {
  let ok = true;
  for (const el of form.elements) {
    if (!el.name || !el.required) continue;
    const vazio = el.type === 'checkbox' ? !el.checked : !String(el.value).trim();
    el.classList.toggle('invalido', vazio);
    if (vazio && ok) { el.focus(); ok = false; }
  }
  if (!ok) toast('Preencha os campos obrigatórios.', 'erro');
  return ok;
}

// ---------------- blocos visuais ----------------

export function kpi(rotulo, valor, nota = '', classe = '') {
  return `<div class="kpi ${classe}">
    <div class="rotulo-kpi">${esc(rotulo)}</div>
    <div class="valor-kpi">${valor}</div>
    ${nota ? `<div class="nota-kpi">${nota}</div>` : ''}
  </div>`;
}

export function vazio(nomeIcone, titulo, texto = '', botao = '') {
  return `<div class="vazio">${icone(nomeIcone)}
    <h3>${esc(titulo)}</h3>
    ${texto ? `<p>${esc(texto)}</p>` : ''}
    ${botao}
  </div>`;
}

export function aviso(tipo, titulo, texto = '', acaoHTML = '') {
  const ic = tipo === 'erro' ? 'alerta' : tipo === 'alerta' ? 'alerta' : tipo === 'ok' ? 'check' : 'info';
  return `<div class="aviso aviso-${tipo}">${icone(ic)}
    <div><strong>${esc(titulo)}</strong>${texto ? esc(texto) : ''} ${acaoHTML}</div></div>`;
}

/** Barra de progresso com cor por faixa de uso. */
/**
 * Barra de meta: o preenchido e' o que ja' foi, o vazio e' o que falta.
 * Diferente de `barra`, onde encher e' ruim (teto do MEI): aqui encher e' o
 * objetivo, entao a cor vai de roxo para verde quando a meta e' batida.
 */
export function barraMeta(pct, batida = false) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="barra-meta${batida ? ' batida' : ''}" role="progressbar"
    aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>`;
}

export function barra(pct, limites = [70, 90]) {
  const p = Math.max(0, Math.min(100, pct));
  const cls = p >= limites[1] ? 'perigo' : p >= limites[0] ? 'atencao' : '';
  return `<div class="barra ${cls}"><span style="width:${p}%"></span></div>`;
}

export function tag(texto, tipo = '') {
  return `<span class="tag ${tipo ? 'tag-' + tipo : ''}">${esc(texto)}</span>`;
}

/** Iniciais para o avatar: "Maria Silva" -> "MS" */
export function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0] || '')[0] + (p.length > 1 ? (p[p.length - 1] || '')[0] : '')).toUpperCase();
}

// ---------------- utilidades ----------------

/** Delegacao de evento: liga(raiz, 'click', '[data-acao]', fn) */
export function liga(raiz, evento, seletor, fn) {
  raiz.addEventListener(evento, (ev) => {
    const alvo = ev.target.closest(seletor);
    if (alvo && raiz.contains(alvo)) fn(ev, alvo);
  });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Faz o navegador baixar um arquivo gerado na hora. */
export function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Abre o seletor de arquivo e devolve o texto lido. */
export function lerArquivo(accept = '.json') {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return resolve(null);
      const fr = new FileReader();
      fr.onload = () => resolve({ nome: f.name, conteudo: fr.result });
      fr.onerror = () => reject(fr.error);
      fr.readAsText(f, 'utf-8');
    };
    inp.click();
  });
}

/**
 * Gera CSV no dialeto que o Excel brasileiro abre sem reclamar:
 * separador ';', decimal com virgula e BOM UTF-8.
 */
export function paraCSV(cabecalhos, linhas) {
  const escapaCampo = (c) => {
    const s = c === null || c === undefined ? '' : String(c);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const corpo = [cabecalhos.map(escapaCampo).join(';')]
    .concat(linhas.map((l) => l.map(escapaCampo).join(';')))
    .join('\r\n');
  return '\uFEFF' + corpo;
}

/** Numero em centavos -> texto para celula de CSV ("1234,50"). */
export function csvMoeda(centavos) {
  return ((centavos || 0) / 100).toFixed(2).replace('.', ',');
}

export { icone };

/**
 * Monta uma tela dentro de um container NOVO a cada desenho.
 *
 * Por que isso importa: as telas se redesenham sozinhas quando o estado muda,
 * e os eventos sao ligados por delegacao no container. Se o container fosse
 * sempre o mesmo elemento, cada redesenho empilharia mais um ouvinte — um
 * clique em "Lançar entrada" acabaria gravando a compra duas vezes, e trocar
 * de tela deixaria o ouvinte da tela anterior escutando os botoes da nova.
 * Container novo a cada desenho faz os ouvintes antigos morrerem junto com ele.
 *
 * Devolve a funcao `desenhar`, para passar ao assinar() do log de eventos.
 */
export function vista(raiz, gerarHTML, ligarFn) {
  const desenhar = async () => {
    const html = await gerarHTML();
    const caixa = document.createElement('div');
    caixa.innerHTML = html;
    raiz.replaceChildren(caixa);
    if (ligarFn) ligarFn(caixa, desenhar);
  };
  desenhar();
  return desenhar;
}
