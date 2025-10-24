// 超簡版快取：首次開啟後可離線使用
const CACHE = 'hq-v1'
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data/sample-characters.csv',
  './manifest.webmanifest'
]
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
})
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k))))
  )
})
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})
