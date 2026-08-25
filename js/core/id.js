// id.js — identificadores unicos e identidade do aparelho.
// ULID-like: 10 chars de tempo (base32) + 16 chars aleatorios.
// Ordenavel por tempo, o que ajuda a ordenar eventos sem depender de relogio sincronizado.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, sem I L O U

function encodeTime(ms, len) {
  let out = '';
  for (let i = len - 1; i >= 0; i--) {
    const mod = ms % 32;
    out = B32[mod] + out;
    ms = (ms - mod) / 32;
  }
  return out;
}

function randomChars(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += B32[bytes[i] % 32];
  return out;
}

let lastMs = 0;
let seq = 0;

/** Gera um ID unico ordenavel por tempo. */
export function novoId() {
  const ms = Date.now();
  if (ms === lastMs) seq++; else { lastMs = ms; seq = 0; }
  return encodeTime(ms, 10) + encodeTime(seq, 2) + randomChars(14);
}

/** Extrai o timestamp (ms) de um ID gerado por novoId. */
export function tempoDoId(id) {
  let ms = 0;
  for (let i = 0; i < 10; i++) ms = ms * 32 + B32.indexOf(id[i]);
  return ms;
}

const CHAVE_DEVICE = 'ame.deviceId';
const CHAVE_DEVICE_NOME = 'ame.deviceNome';

/** ID estavel deste aparelho. Usado para separar os arquivos de evento na sincronia. */
export function deviceId() {
  let id = localStorage.getItem(CHAVE_DEVICE);
  if (!id) {
    id = 'dev-' + randomChars(10).toLowerCase();
    localStorage.setItem(CHAVE_DEVICE, id);
  }
  return id;
}

export function deviceNome() {
  return localStorage.getItem(CHAVE_DEVICE_NOME) || palpiteNomeAparelho();
}

export function setDeviceNome(nome) {
  localStorage.setItem(CHAVE_DEVICE_NOME, nome);
}

function palpiteNomeAparelho() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'PC';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return 'Aparelho';
}
