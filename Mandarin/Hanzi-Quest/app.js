// --- 簡易資料層：載入預設 CSV 或使用者自訂清單 ---
const CharState = {
  list: [],
  index: 0,
  startAt: 0,
  drawnLength: 0, // 用於簡單評分
}

// ====== 形狀比對核心 ======
function renderTemplateGlyph(char, size=256) {
  const c = document.createElement('canvas'); c.width=c.height=size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  // 自動縮放字體讓字填滿方框（保留邊界）
  let fontSize = size * 0.8
  ctx.font = `${fontSize}px system-ui, "Noto Sans CJK TC", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  // 微調直到寬高落在方框內（粗估即可）
  for (let k=0;k<4;k++){
    ctx.clearRect(0,0,size,size)
    ctx.fillText(char, size/2, size/2)
    const {w,h} = roughBBox(ctx, size)
    const scale = 0.88 / Math.max(w/size, h/size)
    fontSize *= scale
    ctx.font = `${fontSize}px system-ui, "Noto Sans CJK TC", sans-serif`
  }
  ctx.clearRect(0,0,size,size)
  ctx.fillText(char, size/2, size/2)
  return c
}

function roughBBox(ctx, size){
  const img = ctx.getImageData(0,0,size,size).data
  let minX=size,maxX=0,minY=size,maxY=0, found=false
  for (let y=0;y<size;y++){
    for (let x=0;x<size;x++){
      const a = img[(y*size+x)*4+3]
      if (a>0){ found=true; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y }
    }
  }
  if(!found) return {x:0,y:0,w:size,h:size}
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}
}

function captureStudentBitmap(size=256){
  // 把目前主畫布的筆跡等比放大到 size×size，去掉邊距
  const src = el.canvas
  const c = document.createElement('canvas'); c.width=c.height=size
  const ctx = c.getContext('2d')
  // 擷取筆跡的邊界盒
  const bbox = inkBBox(src)
  if (!bbox) return c
  ctx.drawImage(src, bbox.x, bbox.y, bbox.w, bbox.h, 0,0, size, size)
  return c
}

function inkBBox(canvas){
  const ctx = canvas.getContext('2d')
  const {width:w,height:h} = canvas
  const img = ctx.getImageData(0,0,w,h).data
  let minX=w,maxX=0,minY=h,maxY=0, found=false
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const a = img[(y*w+x)*4+3]
      if (a>10){ found=true; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y }
    }
  }
  if(!found) return null
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}
}

function toGridBool(canvas, N=64, threshold=64){
  // 將畫布縮到 N×N，>threshold 當成 1
  const tmp = document.createElement('canvas'); tmp.width=tmp.height=N
  const tctx = tmp.getContext('2d')
  tctx.drawImage(canvas, 0,0, N,N)
  const img = tctx.getImageData(0,0,N,N).data
  const grid = Array.from({length:N},()=>Array(N).fill(0))
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      const a = img[(y*N+x)*4+3]
      grid[y][x] = a>threshold ? 1 : 0
    }
  }
  return grid
}

function neighborHit(gridA, gridB, r=2){
  // 對 gridA 的每個 1，檢查 gridB 半徑 r 內是否有 1
  const N = gridA.length
  let hit=0, total=0
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      if (!gridA[y][x]) continue
      total++
      let ok = false
      for (let dy=-r; dy<=r && !ok; dy++){
        const yy = y+dy; if (yy<0||yy>=N) continue
        for (let dx=-r; dx<=r; dx++){
          const xx = x+dx; if (xx<0||xx>=N) continue
          if (gridB[yy][xx]) { ok=true; break }
        }
      }
      if (ok) hit++
    }
  }
  return total ? hit/total : 0
}

function diffDots(gridStu, gridTpl, step=4){
  // 回傳兩類差異點：stu-only（紅）、tpl-missing（藍）
  const N = gridStu.length
  const reds = [], blues = []
  for (let y=0;y<N;y+=step){
    for (let x=0;x<N;x+=step){
      if (gridStu[y][x] && !gridTpl[y][x]) reds.push([x,y])
      if (gridTpl[y][x] && !gridStu[y][x]) blues.push([x,y])
    }
  }
  return {reds, blues}
}

function placeDots(dots, color){
  // 把差異點放到主畫布上（對應縮放）
  const box = el.canvas.getBoundingClientRect()
  const N = 64
  // 先清掉舊的
  document.querySelectorAll('.dot').forEach(n=>n.remove())
  dots.reds.forEach(([x,y])=>{
    const d = document.createElement('div')
    d.className='dot'; d.style.background=color.red
    d.style.left = (el.canvas.offsetLeft + x/N*el.canvas.width - 3)+'px'
    d.style.top  = (el.canvas.offsetTop  + y/N*el.canvas.height - 3)+'px'
    d.style.position='absolute'
    el.canvas.parentElement.appendChild(d)
  })
  dots.blues.forEach(([x,y])=>{
    const d = document.createElement('div')
    d.className='dot'; d.style.background=color.blue
    d.style.left = (el.canvas.offsetLeft + x/N*el.canvas.width - 3)+'px'
    d.style.top  = (el.canvas.offsetTop  + y/N*el.canvas.height - 3)+'px'
    d.style.position='absolute'
    el.canvas.parentElement.appendChild(d)
  })
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

function finishQuestion() {
  // 1) 構建模板與學生位圖
  const char = CharState.list[CharState.index]
  const tplCanvas = renderTemplateGlyph(char, 256)
  const stuCanvas = captureStudentBitmap(256)

  // 2) 轉 64×64 網格
  const tplG = toGridBool(tplCanvas, 64, 40)
  const stuG = toGridBool(stuCanvas, 64, 40)

  // 3) 兩向鄰近比對（半徑 r = 2 可容忍位移）
  const coverage  = neighborHit(tplG, stuG, 2)   // 標準 → 學生
  const precision = neighborHit(stuG, tplG, 2)   // 學生 → 標準
  const score = 0.6 * coverage + 0.4 * precision
  const stars = score >= 0.9 ? 3 : score >= 0.75 ? 2 : score >= 0.55 ? 1 : 0
  el.result.textContent = `評分：${Math.round(score*100)} 分，⭐ x ${stars}`

  // 4) 視覺化回饋（紅=多畫或偏離；藍=漏畫）
  const wantFeedback = document.getElementById('showFeedback')?.checked
  if (wantFeedback){
    const dots = diffDots(stuG, tplG, 3)
    placeDots(dots, { red: '#ef4444', blue: '#3b82f6' })
  } else {
    document.querySelectorAll('.dot').forEach(n=>n.remove())
  }

  // 5) 成就統計（沿用原本）
  updateAchievements(stars)
}

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
