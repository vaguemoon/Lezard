// 強制版本：改這個字串就能讓所有用戶更新
const VERSION = 'hanzi-v3'
const CACHE = `hq-${VERSION}`

const ASSETS = [
  './',
  './index.html',
  './styles.css?v=20251024',
  './app.js?v=20251024',
  './data/sample-characters.csv',
  './manifest.webmanifest'
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // 對 app.js / styles.css 採用「網路優先」
  if (url.pathname.endsWith('/app.js') || url.pathname.endsWith('/styles.css') || url.searchParams.has('v')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // 其他資源：快取優先（離線可用）
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})
