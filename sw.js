// sw.js — service worker: guarda o app inteiro no aparelho.
// Estrategia: "cache primeiro" para os arquivos do app (eles so' mudam quando
// a VERSAO muda) e nada de rede para dados — os dados moram no IndexedDB.
// A API do GitHub nunca passa por aqui: sincronia precisa da resposta real.

const VERSAO = 'ame-store-v2';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/icone.svg',
  './js/main.js',
  './js/core/db.js',
  './js/core/eventlog.js',
  './js/core/fmt.js',
  './js/core/id.js',
  './js/core/state.js',
  './js/core/sync.js',
  './js/domain/acoes.js',
  './js/domain/consultas.js',
  './js/domain/dre.js',
  './js/domain/demo.js',
  './js/ui/barras.js',
  './js/ui/graficos.js',
  './js/ui/icones.js',
  './js/ui/router.js',
  './js/ui/ui.js',
  './js/ui/views/ajustes.js',
  './js/ui/views/cliente.js',
  './js/ui/views/clientes.js',
  './js/ui/views/despesas.js',
  './js/ui/views/dre.js',
  './js/ui/views/entrada.js',
  './js/ui/views/estoque.js',
  './js/ui/views/etiquetas.js',
  './js/ui/views/financeiro.js',
  './js/ui/views/inicio.js',
  './js/ui/views/mais.js',
  './js/ui/views/pagamento.js',
  './js/ui/views/produto.js',
  './js/ui/views/relatorios.js',
  './js/ui/views/venda-detalhe.js',
  './js/ui/views/vendas.js',
  './js/ui/views/vender.js',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // addAll falha inteiro se um arquivo faltar; guardamos um a um para o app
    // continuar instalavel mesmo que algo mude de nome no futuro.
    await Promise.all(ARQUIVOS.map((a) => cache.add(a).catch((e) => console.warn('sw: não cacheou', a, e))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // GitHub API e afins: direto na rede

  ev.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) {
      // Atualiza em segundo plano, sem travar a tela.
      fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return guardado;
    }
    try {
      const resposta = await fetch(req);
      if (resposta && resposta.ok) cache.put(req, resposta.clone());
      return resposta;
    } catch (err) {
      const indice = await cache.match('./index.html');
      if (indice && req.mode === 'navigate') return indice;
      throw err;
    }
  })());
});
