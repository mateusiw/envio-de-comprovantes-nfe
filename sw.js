// Service worker: guarda o app e as bibliotecas para abrir sem internet.
// Ao mudar a lista abaixo ou quiser forçar atualização do cache, troque a versão.
const CACHE = 'spg-app-v4';

const PRECACHE_LOCAL = ['./', './index.html'];
const PRECACHE_CDN = [
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/lucide@latest',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Com sinal fraco, não espera a rede para sempre: depois disso usa a cópia guardada
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await Promise.all([
            ...PRECACHE_LOCAL.map(url => cache.add(url).catch(err => console.warn('SW: falha ao guardar', url, err))),
            // CDNs são de outro domínio: guarda a resposta "opaca" (mesmo modo usado pela tag <script>)
            ...PRECACHE_CDN.map(url => fetch(new Request(url, { mode: 'no-cors' }))
                .then(resp => cache.put(url, resp))
                .catch(err => console.warn('SW: falha ao guardar', url, err)))
        ]);
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return; // envios (ex: planilha) seguem direto para a rede

    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(req));
    } else if (PRECACHE_CDN.some(u => req.url.startsWith(u))) {
        event.respondWith(cacheFirst(req));
    }
});

// Página do app: tenta a versão mais nova; sem sinal (ou lento), usa a guardada
async function networkFirst(req) {
    const cache = await caches.open(CACHE);
    try {
        const resp = await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
        ]);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
    } catch (err) {
        const cached = await cache.match(req, { ignoreSearch: true })
            || (req.mode === 'navigate' && await cache.match('./index.html'));
        if (cached) return cached;
        throw err;
    }
}

// Bibliotecas de CDN: usa a guardada e só busca na rede se ainda não tiver
async function cacheFirst(req) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req.url);
    if (cached) return cached;
    const resp = await fetch(req);
    cache.put(req.url, resp.clone());
    return resp;
}
