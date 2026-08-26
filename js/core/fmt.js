// fmt.js — formatacao e aritmetica de dinheiro.
//
// REGRA CENTRAL: todo valor monetario e' guardado como INTEIRO EM CENTAVOS.
// R$ 129,90 vira 12990. Nunca use ponto flutuante para guardar dinheiro:
// 0.1 + 0.2 !== 0.3 em JavaScript, e um centavo perdido por venda vira
// divergencia de caixa no fim do mes.
// Percentuais (taxa de cartao, comissao) sao numeros normais — o resultado
// da aplicacao sempre volta arredondado para centavos.

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR');
const fmtNum2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos -> "R$ 1.299,90" */
export function brl(centavos) {
  return fmtBRL.format((centavos || 0) / 100);
}

/** Centavos -> "1.299,90" (sem simbolo) */
export function brlSimples(centavos) {
  return fmtNum2.format((centavos || 0) / 100);
}

/** Numero inteiro com separador de milhar */
export function num(n) {
  return fmtNum.format(n || 0);
}

/** 12.345 -> "12,3%" */
export function pct(n, casas = 1) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(casas).replace('.', ',') + '%';
}

/**
 * Le texto digitado pelo usuario e devolve centavos.
 * Aceita "129,90", "129.90", "1.299,90", "R$ 129,90", "129".
 */
export function paraCentavos(texto) {
  if (typeof texto === 'number') return Math.round(texto * 100);
  if (!texto) return 0;
  let s = String(texto).replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    // "1.299,90" -> ponto e' milhar
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  }
  // so ponto: pode ser decimal ("129.90") ou milhar ("1.299").
  // Se houver exatamente 3 digitos depois do ultimo ponto, tratamos como milhar.
  else if (temPonto) {
    const partes = s.split('.');
    const ultima = partes[partes.length - 1];
    if (partes.length > 1 && ultima.length === 3) s = partes.join('');
  }
  const v = parseFloat(s);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

/** Aplica percentual sobre centavos, arredondando para o centavo. */
export function aplicaPct(centavos, percentual) {
  return Math.round((centavos * (percentual || 0)) / 100);
}

/**
 * Divide centavos em N parcelas sem perder nem criar centavo.
 * O resto vai para as primeiras parcelas (padrao do mercado).
 */
export function dividirCentavos(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

// ---------- Datas ----------
// Datas de negocio sao guardadas como texto "AAAA-MM-DD" (sem fuso, sem surpresa).
// Timestamps tecnicos (quando o evento foi gravado) sao ms epoch.

/** Date -> "AAAA-MM-DD" no fuso local */
export function iso(d = new Date()) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
}

/** "AAAA-MM-DD" -> "25/08/2026" */
export function dataBR(s) {
  if (!s) return '—';
  const [a, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** "AAAA-MM-DD" -> "25/08" */
export function dataCurta(s) {
  if (!s) return '—';
  const [, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** ms epoch -> "25/08/2026 14:32" */
export function dataHora(ms) {
  const d = new Date(ms);
  return dataBR(iso(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** "AAAA-MM-DD" -> "AAAA-MM" (competencia) */
export function competencia(dataIso) {
  return String(dataIso || '').slice(0, 7);
}

/** "AAAA-MM" -> "Agosto/2026" */
export function competenciaBR(comp) {
  if (!comp) return '—';
  const [a, m] = comp.split('-');
  return MESES[parseInt(m, 10) - 1] + '/' + a;
}

/** "AAAA-MM" -> "ago/26" */
export function competenciaCurta(comp) {
  if (!comp) return '—';
  const [a, m] = comp.split('-');
  return MESES_CURTOS[parseInt(m, 10) - 1] + '/' + a.slice(2);
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Soma dias a uma data "AAAA-MM-DD", devolvendo "AAAA-MM-DD". */
export function somaDias(dataIso, dias) {
  const [a, m, d] = String(dataIso).slice(0, 10).split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return iso(dt);
}

/** Soma meses a uma competencia "AAAA-MM". */
export function somaMeses(comp, meses) {
  const [a, m] = comp.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return ano + '-' + String(mes).padStart(2, '0');
}

/**
 * Soma meses a uma data "AAAA-MM-DD" mantendo o dia do mes.
 * Quando o mes de destino e' mais curto, gruda no ultimo dia dele:
 * 31/01 + 1 mes = 28/02 (e nao 03/03). E' assim que a cliente entende
 * "todo dia 31" quando o mes nao tem dia 31.
 */
export function somaMesesData(dataIso, meses) {
  const [a, m, d] = String(dataIso).slice(0, 10).split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Primeiro e ultimo dia de uma competencia "AAAA-MM". */
export function limitesDaCompetencia(comp) {
  const [a, m] = comp.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { inicio: `${comp}-01`, fim: `${comp}-${String(ultimo).padStart(2, '0')}` };
}

/** Lista as N competencias terminando em `ate` (inclusive), da mais antiga para a mais nova. */
export function ultimasCompetencias(ate, n) {
  return Array.from({ length: n }, (_, i) => somaMeses(ate, i - (n - 1)));
}

/** Escapa texto para interpolar em HTML com seguranca. */
export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Normaliza texto para busca: minusculo, sem acento. */
export function normaliza(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
