// main.js — ponto de partida. Liga banco, log de eventos, rotas e sincronia.

import * as log from './core/eventlog.js';
import { pedirPersistencia } from './core/db.js';
import { registrar, iniciarRoteador, irPara, voltar } from './ui/router.js';
import { icone } from './ui/icones.js';
import { toast } from './ui/ui.js';
import * as sync from './core/sync.js';

const ROTAS = [
  ['/', 'Início', 'inicio'],
  ['/vender', 'Vender', 'vender'],
  ['/vendas', 'Vendas', 'vendas'],
  ['/venda/:id', 'Venda', 'venda-detalhe', true],
  ['/estoque', 'Estoque', 'estoque'],
  ['/produto/:id', 'Produto', 'produto', true],
  ['/clientes', 'Clientes', 'clientes'],
  ['/cliente/:id', 'Cliente', 'cliente', true],
  ['/despesas', 'Despesas', 'despesas'],
  ['/financeiro', 'Financeiro', 'financeiro'],
  ['/metas', 'Metas', 'metas'],
  ['/dre', 'DRE', 'dre'],
  ['/relatorios', 'Relatórios', 'relatorios'],
  ['/ajustes', 'Ajustes', 'ajustes'],
  ['/mais', 'Mais', 'mais'],
  ['/etiquetas', 'Etiquetas', 'etiquetas', true],
];

for (const [caminho, titulo, arquivo, temVoltar] of ROTAS) {
  registrar(caminho, {
    titulo,
    temVoltar: !!temVoltar,
    carregar: () => import(`./ui/views/${arquivo}.js`),
  });
}

function preencherIcones() {
  for (const el of document.querySelectorAll('[data-icone]')) {
    const alvo = el.querySelector('span') || el;
    if (alvo.innerHTML.trim() === '') alvo.innerHTML = icone(el.dataset.icone);
  }
  document.getElementById('btn-voltar').innerHTML = icone('voltar');
  document.getElementById('btn-sync').innerHTML = icone('sincronizar');
}

function ligarBotoes() {
  document.getElementById('btn-voltar').onclick = () => voltar();
  document.getElementById('btn-sync').onclick = async () => {
    const btn = document.getElementById('btn-sync');
    btn.disabled = true;
    try {
      const r = await sync.sincronizar({ manual: true });
      if (r.desligada) toast('Sincronia não configurada. Veja em Ajustes.');
      else toast(`Sincronizado — ${r.enviados} enviados, ${r.recebidos} recebidos.`, 'ok');
    } catch (err) {
      toast('Falha na sincronia: ' + (err.message || err), 'erro');
    } finally {
      btn.disabled = false;
      atualizarStatusSync();
    }
  };
}

export function atualizarStatusSync() {
  const el = document.getElementById('status-sync-lateral');
  if (!el) return;
  const s = sync.estadoSincronia();
  el.textContent = s.configurada
    ? (s.ultima ? 'Sincronizado ' + s.ultima : 'Sincronia pronta')
    : 'Sincronia desligada';
}

/**
 * Atualizacao do app.
 *
 * O service worker novo ja' assume sozinho (`skipWaiting` + `clients.claim` no
 * sw.js), mas a tela aberta continua rodando os arquivos velhos que carregou —
 * por isso "fechar e abrir" virava "fechar e abrir DUAS vezes", e no celular,
 * onde ninguem fecha o app de verdade, a versao velha ficava semanas.
 *
 * Aqui a pagina se recarrega assim que a versao nova assume. Nao recarrega no
 * meio de uma venda nem com um modal aberto: nesse caso espera o app voltar
 * para a frente e tentar de novo. Perder um carrinho para "estar atualizado" e'
 * um mau negocio.
 */
let atualizacaoPendente = false;
let recarregando = false;

function podeRecarregar() {
  if (document.querySelector('.fundo-modal')) return false;
  if ((location.hash || '').startsWith('#/vender')) return false;
  return true;
}

function aplicarAtualizacao() {
  if (recarregando) return;
  if (!podeRecarregar()) {
    atualizacaoPendente = true;
    toast('Versão nova pronta. Ela entra quando você sair desta tela.');
    return;
  }
  recarregando = true;
  location.reload();
}

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  try {
    // Na primeira instalacao o `clients.claim` tambem dispara controllerchange,
    // e ali nao ha' nada para atualizar — recarregar seria um susto a toa.
    const jaTinhaControlador = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (jaTinhaControlador) aplicarAtualizacao();
    });
    window.addEventListener('hashchange', () => { if (atualizacaoPendente) aplicarAtualizacao(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (atualizacaoPendente) { aplicarAtualizacao(); return; }
      // Voltou para a frente: e' a hora barata de perguntar se saiu versao nova.
      reg.update().catch(() => {});
    });
  } catch (err) {
    console.warn('service worker não registrou', err);
  }
}

async function iniciar() {
  preencherIcones();
  ligarBotoes();

  try {
    await log.carregar();
  } catch (err) {
    console.error(err);
    document.getElementById('conteudo').innerHTML =
      `<div class="aviso aviso-erro">${icone('alerta')}<div><strong>Não consegui abrir os dados neste aparelho.</strong>
       ${err.message || err}. Se estiver em janela anônima, o navegador bloqueia o armazenamento.</div></div>`;
    return;
  }

  pedirPersistencia();
  await sync.iniciar();
  log.definirGatilhoSincronia(() => sync.sincronizar({}).catch((e) => console.warn('sincronia adiada:', e.message)));

  iniciarRoteador();
  atualizarStatusSync();
  registrarServiceWorker();

  // Ao sair, tenta empurrar o que ficou pendente.
  window.addEventListener('pagehide', () => { sync.enviarPendentesRapido(); });

  // Consulta periodica: e' o que faz o lancamento de um aparelho aparecer nos
  // outros sozinho. Quem cuida de pausar quando o app sai da frente e' o
  // proprio sync.js.
  sync.ligarAtualizacaoAutomatica((resultado) => {
    atualizarStatusSync();
    if (resultado.recebidos) {
      toast(`${resultado.recebidos} ${resultado.recebidos === 1 ? 'lançamento novo' : 'lançamentos novos'} de outro aparelho.`);
    }
  });
}

window.addEventListener('error', (ev) => {
  console.error('erro nao tratado', ev.error || ev.message);
});

iniciar();

export { irPara };
