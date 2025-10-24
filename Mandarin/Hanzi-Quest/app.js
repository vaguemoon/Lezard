// --- 簡易資料層：載入預設 CSV 或使用者自訂清單 ---
const CharState = {
  list: [],
  index: 0,
  startAt: 0,
  drawnLength: 0, // 用於簡單評分
}

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

function persist() {
  localStorage.setItem('hanziQuest:list', JSON.stringify(CharState.list))
}
function restore() {
  const s = localStorage.getItem('hanziQuest:list')
  if (s) {
    try { CharState.list = JSON.parse(s); } catch {}
  }
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
    opt.textContent = `${i+1}. ${c}`
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
  CharState.startAt = performance.now()
  CharState.drawnLength = 0
  el.result.textContent = ''
}

function clearCanvas() {
  ctx.clearRect(0,0,el.canvas.width, el.canvas.height)
  // 助線
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line')
  ctx.lineWidth = 1
  ctx.setLineDash([5,5])
  ctx.strokeRect(0.5,0.5,el.canvas.width-1, el.canvas.height-1)
  ctx.setLineDash([])
}

// 繪圖：滑鼠/觸控/筆
let drawing = false, last = null
function startDraw(x,y){ drawing = true; last = {x,y}; ctx.beginPath(); ctx.moveTo(x,y) }
function moveDraw(x,y){
  if (!drawing) return
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#888'
  ctx.lineTo(x,y); ctx.stroke()
  if (last){ CharState.drawnLength += Math.hypot(x-last.x, y-last.y); last={x,y} }
}
function endDraw(){ drawing = false; last = null }

el.canvas.addEventListener('pointerdown', e => { e.preventDefault(); el.canvas.setPointerCapture(e.pointerId); startDraw(e.offsetX,e.offsetY) })
el.canvas.addEventListener('pointermove', e => moveDraw(e.offsetX,e.offsetY))
window.addEventListener('pointerup', () => endDraw())

// 簡單評分：依「描紅長度」與「用時」給星等（不做真實字形比對，MVP 示意）
function finishQuestion() {
  const elapsed = Math.max(300, performance.now() - CharState.startAt) // ms
  const lenScore = Math.min(1, CharState.drawnLength / 800)          // 畫得越多越像
  const timeScore = Math.min(1, 6000 / elapsed)                       // 太久扣分
  const score = 0.65 * lenScore + 0.35 * timeScore
  const stars = score >= 0.9 ? 3 : score >= 0.75 ? 2 : score >= 0.55 ? 1 : 0
  el.result.textContent = `評分：${Math.round(score*100)} 分，⭐️ x ${stars}`
  updateAchievements(stars)
}

function updateAchievements(stars) {
  const key = 'hanziQuest:stats'
  const s = JSON.parse(localStorage.getItem(key) || '{"count":0,"stars":0,"streak":0,"last":0}')
  const today = new Date(); today.setHours(0,0,0,0)
  const last = s.last ? new Date(s.last) : null
  const isConsecutive = last && ((today - last) === 86400000)
  s.count += 1
  s.stars += stars
  s.streak = isConsecutive ? (s.streak+1) : 1
  s.last = today.getTime()
  localStorage.setItem(key, JSON.stringify(s))

  const items = [
    { id:'streak-3', name:'連續學習 3 天', unlocked: s.streak>=3 },
    { id:'streak-7', name:'連續學習 7 天', unlocked: s.streak>=7 },
    { id:'play-10', name:'完成 10 題', unlocked: s.count>=10 },
    { id:'star-10', name:'累積 10 顆星', unlocked: s.stars>=10 },
  ]
  el.achv.innerHTML = items.map(i => `<li>${i.unlocked?'✅':'⬜️'} ${i.name}</li>`).join('')
}

// 事件
el.prev.onclick = () => setChar(CharState.index - 1)
el.next.onclick = () => setChar(CharState.index + 1)
el.select.onchange = () => setChar(Number(el.select.value))
el.clear.onclick = () => clearCanvas()
el.finish.onclick = () => finishQuestion()
el.loadCustom.onclick = () => { useCustomList(el.custom.value); renderSelect(); setChar(0) }

// 啟動
;(async function init(){
  restore()
  if (!CharState.list.length) await loadDefaultList()
  renderSelect()
  setChar(0)
  updateAchievements(0)
})()
