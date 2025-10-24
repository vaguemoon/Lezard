// Hanzi-Quest app.js — 乾淨回饋版（三個紅色熱區 + 語音鼓勵 + 寬鬆評分）
// ---------------------------------------------------------------

// --- 簡易資料層：載入預設 CSV 或使用者自訂清單 ---
const CharState = {
  list: [],
  index: 0,
  startAt: 0,
  drawnLength: 0, // 可用於統計
}

// ====== 形狀比對核心 ======
function renderTemplateGlyph(char, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  let fontSize = size * 0.8
  ctx.font = `${fontSize}px system-ui, "Noto Sans CJK TC", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  // 多次微調，讓字填滿方框（保留邊界）
  for (let k = 0; k < 4; k++) {
    ctx.clearRect(0, 0, size, size)
    ctx.fillText(char, size / 2, size / 2)
    const { w, h } = roughBBox(ctx, size)
    const scale = 0.88 / Math.max(w / size, h / size)
    fontSize *= scale
    ctx.font = `${fontSize}px system-ui, "Noto Sans CJK TC", sans-serif`
  }
  ctx.clearRect(0, 0, size, size)
  ctx.fillText(char, size / 2, size / 2)
  return c
}

function roughBBox(ctx, size) {
  const img = ctx.getImageData(0, 0, size, size).data
  let minX = size, maxX = 0, minY = size, maxY = 0, found = false
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = img[(y * size + x) * 4 + 3]
      if (a > 0) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
  }
  if (!found) return { x: 0, y: 0, w: size, h: size }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

function captureStudentBitmap(size = 256) {
  // 把目前主畫布的筆跡等比放大到 size×size，去掉邊距
  const src = el.canvas
  const c = document.createElement('canvas'); c.width = c.height = size
  const ctx = c.getContext('2d')
  const bbox = inkBBox(src)
  if (!bbox) return c
  ctx.drawImage(src, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, size, size)
  return c
}

function inkBBox(canvas) {
  const ctx = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  const img = ctx.getImageData(0, 0, w, h).data
  let minX = w, maxX = 0, minY = h, maxY = 0, found = false
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = img[(y * w + x) * 4 + 3]
      if (a > 10) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
  }
  if (!found) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

function toGridBool(canvas, N = 64, threshold = 64) {
  // 將畫布縮到 N×N，>threshold 當成 1
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = N
  const tctx = tmp.getContext('2d')
  tctx.drawImage(canvas, 0, 0, N, N)
  const img = tctx.getImageData(0, 0, N, N).data
  const grid = Array.from({ length: N }, () => Array(N).fill(0))
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = img[(y * N + x) * 4 + 3]
      grid[y][x] = a > threshold ? 1 : 0
    }
  }
  return grid
}

function neighborHit(gridA, gridB, r = 3) {
  // 對 gridA 的每個 1，檢查 gridB 半徑 r 內是否有 1（容忍位移）
  const N = gridA.length
  let hit = 0, total = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!gridA[y][x]) continue
      total++
      let ok = false
      for (let dy = -r; dy <= r && !ok; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= N) continue
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= N) continue
          if (gridB[yy][xx]) { ok = true; break }
        }
      }
      if (ok) hit++
    }
  }
  return total ? hit / total : 0
}

// ---------- 只顯示「前三大錯誤區域」的算法 ----------
function diffHeatmap(gridStu, gridTpl) {
  const N = gridStu.length
  const heat = Array.from({ length: N }, () => Array(N).fill(0))
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = gridStu[y][x], b = gridTpl[y][x]
      heat[y][x] = (a ^ b) ? 1 : 0 // 不同即認為需修正：多畫或漏畫
    }
  }
  return heat
}

function topKErrorBoxes(heat, win = 10, k = 3, suppress = 8) {
  const N = heat.length
  // 積分圖（Integral Image）
  const ii = Array.from({ length: N + 1 }, () => Array(N + 1).fill(0))
  for (let y = 1; y <= N; y++) {
    for (let x = 1; x <= N; x++) {
      ii[y][x] = heat[y - 1][x - 1] + ii[y - 1][x] + ii[y][x - 1] - ii[y - 1][x - 1]
    }
  }
  const sumRect = (x0, y0, x1, y1) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(N, x1); y1 = Math.min(N, y1)
    return ii[y1][x1] - ii[y0][x1] - ii[y1][x0] + ii[y0][x0]
  }

  const boxes = []
  const used = Array.from({ length: N }, () => Array(N).fill(false))
  const mark = (cx, cy, r) => {
    for (let y = Math.max(0, cy - r); y < Math.min(N, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(N, cx + r); x++) used[y][x] = true
    }
  }

  for (let t = 0; t < k; t++) {
    let best = { score: 0, x: 0, y: 0 }
    for (let y = 0; y <= N - win; y++) {
      for (let x = 0; x <= N - win; x++) {
        let skip = false
        for (let yy = y; yy < y + win && !skip; yy++) {
          for (let xx = x; xx < x + win; xx++) { if (used[yy][xx]) { skip = true; break } }
        }
        if (skip) continue
        const s = sumRect(x, y, x + win, y + win)
        if (s > best.score) best = { score: s, x, y }
      }
    }
    if (best.score <= 0) break
    boxes.push(best)
    mark(best.x + Math.floor(win / 2), best.y + Math.floor(win / 2), suppress)
  }
  return boxes
}

function drawHotBoxes(boxes, win = 10) {
  document.querySelectorAll('.hotbox').forEach(n => n.remove())
  const N = 64
  boxes.forEach(b => {
    const div = document.createElement('div')
    div.className = 'hotbox'
    const x = el.canvas.offsetLeft + (b.x / N) * el.canvas.width
    const y = el.canvas.offsetTop + (b.y / N) * el.canvas.height
    const w = (win / N) * el.canvas.width
    const h = (win / N) * el.canvas.height
    div.style.left = `${x}px`; div.style.top = `${y}px`
    div.style.width = `${w}px`; div.style.height = `${h}px`
    el.canvas.parentElement.appendChild(div)
  })
}
function clearHotBoxes() { document.querySelectorAll('.hotbox').forEach(n => n.remove()) }

function speak(msg) {
  try {
    const s = new SpeechSynthesisUtterance(msg)
    s.lang = 'zh-TW'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(s)
  } catch { /* 忽略 */ }
}

// ====== 載入/儲存 ======
async function loadDefaultList() {
  const res = await fetch('./data/sample-characters.csv')
  const text = await res.text()
  CharState.list = text.split('\n').map(l => l.trim()).filter(Boolean)
  CharState.index = 0
}
function useCustomList(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length) {
    CharState.list = lines
    CharState.index = 0
    persist()
  }
}
function persist() { localStorage.setItem('hanziQuest:list', JSON.stringify(CharState.list)) }
function restore() {
  const s = localStorage.getItem('hanziQuest:list')
  if (s) { try { CharState.list = JSON.parse(s) } catch { } }
}

// --- UI 控制 ---
const el = {
  target: document.getElementById('targetChar'),
  select: document.getElementById('charSelect'),
  prev: document.getElementById('prevBtn'),
  next: document.getElementById('nextBtn'),
  clear: document.getElementById('clearBtn'),
  finish: document.getElementById('finishBtn'),
  result: document.getElementById('result'),
  custom: document.getElementById('customList'),
  loadCustom: document.getElementById('loadCustom'),
  achv: document.getElementById('achievements'),
  canvas: document.getElementById('board'),
}
const ctx = el.canvas.getContext('2d')

function renderSelect() {
  el.select.innerHTML = ''
  CharState.list.forEach((c, i) => {
    const opt = document.createElement('option')
    opt.value = String(i)
    opt.textContent = `${i + 1}. ${c}`
    el.select.appendChild(opt)
  })
  el.select.value = String(CharState.index)
}

function setChar(i) {
  CharState.index = (i + CharState.list.length) % CharState.list.length
  el.select.value = String(CharState.index)
  const c = CharState.list[CharState.index]
  el.target.textContent = c
  clearCanvas()
  clearHotBoxes() // 換題時移除提示框
  CharState.startAt = performance.now()
  CharState.drawnLength = 0
  el.result.textContent = ''
}

function clearCanvas() {
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height)
  // 助線
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line')
  ctx.lineWidth = 1
  ctx.setLineDash([5, 5])
  ctx.strokeRect(0.5, 0.5, el.canvas.width - 1, el.canvas.height - 1)
  ctx.setLineDash([])
  clearHotBoxes() // 清畫布時同步清提示框
}

// 繪圖：滑鼠/觸控/筆
let drawing = false, last = null
function startDraw(x, y) { drawing = true; last = { x, y }; ctx.beginPath(); ctx.moveTo(x, y) }
function moveDraw(x, y) {
  if (!drawing) return
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#888'
  ctx.lineTo(x, y); ctx.stroke()
  if (last) { CharState.drawnLength += Math.hypot(x - last.x, y - last.y); last = { x, y } }
}
function endDraw() { drawing = false; last = null }

el.canvas.addEventListener('pointerdown', e => { e.preventDefault(); el.canvas.setPointerCapture(e.pointerId); startDraw(e.offsetX, e.offsetY) })
el.canvas.addEventListener('pointermove', e => moveDraw(e.offsetX, e.offsetY))
window.addEventListener('pointerup', () => endDraw())

function finishQuestion() {
  const char = CharState.list[CharState.index]
  const tplCanvas = renderTemplateGlyph(char, 256)
  const stuCanvas = captureStudentBitmap(256)

  // 完全沒寫 → 直接 0 分
  const bbox = inkBBox(el.canvas)
  if (!bbox) {
    el.result.textContent = `評分：0 分，⭐ x 0`
    clearHotBoxes()
    speak('沒關係，再寫一次！')
    updateAchievements(0)
    return
  }

  // 轉 64×64 網格
  const tplG = toGridBool(tplCanvas, 64, 40)
  const stuG = toGridBool(stuCanvas, 64, 40)

  // 寬鬆評分（偏重結構對齊）
  const coverage = neighborHit(tplG, stuG, 3)   // 標準 → 學生
  const precision = neighborHit(stuG, tplG, 3)  // 學生 → 標準
  const score = 0.7 * coverage + 0.3 * precision
  const stars = score >= 0.88 ? 3 : score >= 0.68 ? 2 : score >= 0.48 ? 1 : 0
  el.result.textContent = `評分：${Math.round(score * 100)} 分，⭐ x ${stars}`

  // 三個紅色熱區（只顯示需要修正的地方）
  const heat = diffHeatmap(stuG, tplG)
  const boxes = topKErrorBoxes(heat, 10, 3, 8) // 視窗=10格，最多3塊，抑制半徑8
  const show = document.getElementById('showFeedback')?.checked
  if (show && boxes.length) drawHotBoxes(boxes, 10); else clearHotBoxes()

  // 語音鼓勵
  if (stars >= 2) speak('太棒了！')
  else if (stars === 1) speak('快完成了，再加油！')
  else speak('我們一起把紅色方框的地方修好！')

  updateAchievements(stars)
}

function updateAchievements(stars) {
  const key = 'hanziQuest:stats'
  const s = JSON.parse(localStorage.getItem(key) || '{"count":0,"stars":0,"streak":0,"last":0}')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const last = s.last ? new Date(s.last) : null
  const isConsecutive = last && ((today - last) === 86400000)
  s.count += 1
  s.stars += stars
  s.streak = isConsecutive ? (s.streak + 1) : 1
  s.last = today.getTime()
  localStorage.setItem(key, JSON.stringify(s))

  const items = [
    { id: 'streak-3', name: '連續學習 3 天', unlocked: s.streak >= 3 },
    { id: 'streak-7', name: '連續學習 7 天', unlocked: s.streak >= 7 },
    { id: 'play-10', name: '完成 10 題', unlocked: s.count >= 10 },
    { id: 'star-10', name: '累積 10 顆星', unlocked: s.stars >= 10 },
  ]
  el.achv.innerHTML = items.map(i => `<li>${i.unlocked ? '✅' : '⬜️'} ${i.name}</li>`).join('')
}

// 事件
el.prev.onclick = () => setChar(CharState.index - 1)
el.next.onclick = () => setChar(CharState.index + 1)
el.select.onchange = () => setChar(Number(el.select.value))
el.clear.onclick = () => clearCanvas()
el.finish.onclick = () => finishQuestion()
el.loadCustom.onclick = () => { useCustomList(el.custom.value); renderSelect(); setChar(0) }

// 啟動
; (async function init() {
  restore()
  if (!CharState.list.length) await loadDefaultList()
  renderSelect()
  setChar(0)
  updateAchievements(0)
})()
