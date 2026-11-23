// ASTO — «рентген-сервис»: машина просвечивается, разлетается на детали, детали меняются, машина собирается и заводится.
// Текст и карточки работают и без WebGL/GSAP (E1, E3).
const $ = (s) => document.querySelector(s)
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const range = (v, a, b) => clamp01((v - a) / (b - a))
const smooth = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined'

// ── главы: доля прокрутки блока #journey, где начинается каждая
const CHAPTERS = [0, 0.2, 0.42, 0.62, 0.8]
const CARDS = { 1: [0.18, 0.4], 2: [0.43, 0.6], 3: [0.62, 0.78], 4: [0.8, 0.95] }

// ── N4: плавная прокрутка для мыши
let lenis = null
if (fine && !reduced && typeof window.Lenis !== 'undefined') {
  lenis = new window.Lenis({ lerp: 0.085 })
  if (hasGsap) {
    lenis.on('scroll', window.ScrollTrigger.update)
    window.gsap.ticker.add((t) => lenis.raf(t * 1000))
    window.gsap.ticker.lagSmoothing(0)
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
  }
}
const scrollToY = (y) => {
  if (lenis) lenis.scrollTo(y, { duration: 1.6 })
  else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' })
}

const journey = $('#journey')
let jTop = 0
let jLen = 1
const measure = () => { jTop = journey.offsetTop; jLen = Math.max(1, journey.offsetHeight - window.innerHeight) }
measure()
window.addEventListener('resize', measure)
const journeyU = () => clamp01((window.scrollY - jTop) / jLen)

// ── R7: ссылки на блоки
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]')
  if (!link) return
  const id = link.getAttribute('href')
  const target = id === '#top' ? journey : $(id)
  if (!target) return
  e.preventDefault()
  if (id === '#journey') return scrollToY(jTop + CHAPTERS[1] * jLen + 2)
  scrollToY(id === '#top' ? 0 : target.getBoundingClientRect().top + window.scrollY - 70)
})

// ── R4: индикатор глав и карточки
const chapterBtns = [...document.querySelectorAll('[data-chapter]')]
chapterBtns.forEach((btn) => btn.addEventListener('click', () => {
  const i = Number(btn.dataset.chapter)
  scrollToY(jTop + CHAPTERS[i] * jLen + (i ? 0.02 * jLen : 0))
}))
const cards = [...document.querySelectorAll('[data-card]')]
const hud = $('#hud')
const sceneEl = $('#scene')
let hudState = ''
function updateHud(u) {
  const inJourney = window.scrollY < jTop + jLen + window.innerHeight * 0.35
  let chapter = 0
  CHAPTERS.forEach((c, i) => { if (u >= c - 0.001) chapter = i })
  const on = cards.map((c) => { const r = CARDS[c.dataset.card]; return u > r[0] && u < r[1] })
  const key = `${inJourney}|${chapter}|${on.join()}`
  if (key === hudState) return
  hudState = key
  hud.classList.toggle('is-off', !inJourney || u > 0.985)
  sceneEl.classList.toggle('is-off', !inJourney) // N2: вне пролёта рендер на паузе
  chapterBtns.forEach((b, i) => (i === chapter ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')))
  cards.forEach((c, i) => c.classList.toggle('is-on', on[i]))
}

// ── главный цикл
let uShown = journeyU()
let gl = null
let last = performance.now()
const pointer = { x: 0, y: 0 }
if (fine && !reduced) window.addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1 })
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const u = journeyU()
  uShown += (u - uShown) * (1 - Math.exp(-dt * (reduced ? 60 : 5.5)))
  if (Math.abs(u - uShown) < 0.0002) uShown = u
  updateHud(uShown)
  window.__u = uShown
  if (gl && !sceneEl.classList.contains('is-off')) gl.render(uShown, now / 1000, dt, pointer)
  hooks.forEach((h) => h(now / 1000, dt))
  requestAnimationFrame(frame)
}
const hooks = [] // покадровые задачи нижних блоков (двигатель, бегущая строка)
requestAnimationFrame(frame)

// ── R10: разбор двигателя — прогресс по прокрутке раздела, подсветка узлов, 3D отдельным модулем
const engineEl = $('#engine')
const partEls = [...document.querySelectorAll('[data-part]')]
const engineStatus = $('#engine-status')
let engineApi = null
let engineVisible = false
let eShown = 0
new IntersectionObserver(([en]) => (engineVisible = en.isIntersecting), { rootMargin: '10% 0px' }).observe(engineEl)
const engineProgress = () => {
  const r = engineEl.getBoundingClientRect()
  return clamp01(-r.top / Math.max(1, r.height - window.innerHeight))
}
let lastActive = -2
const PART_AT_FLAT = [0.3, 0.42, 0.52, 0.62, 0.72, 0.82]
function markPart(active) {
  if (active === lastActive) return
  lastActive = active
  partEls.forEach((li, i) => {
    li.dataset.on = String(i === Math.max(0, active))
    li.dataset.done = String(i < active)
  })
}
hooks.push((time, dt) => {
  if (!engineVisible) return
  const e = engineProgress()
  eShown += (e - eShown) * (1 - Math.exp(-dt * (reduced ? 60 : 4)))
  if (engineApi) {
    const st = engineApi.render(eShown, dt, time, pointer)
    markPart(st.active)
    engineStatus.textContent = st.stage === 'whole' ? 'Двигатель в сборе' : st.stage === 'cut' ? 'Разрез: смотрим внутрь' : `Узел ${st.active + 1} из 6 в разрезе`
  } else {
    let a = -1
    PART_AT_FLAT.forEach((p, i) => { if (eShown >= p - 0.01) a = i })
    markPart(a)
  }
})
// второй 3D-движок запускаем только на подходе к разделу, чтобы не тормозить начало страницы
const engineLoadObs = new IntersectionObserver(([en]) => {
  if (!en.isIntersecting) return
  engineLoadObs.disconnect()
  import('./engine.js?v=5')
    .then(({ createEngine }) => createEngine($('#engine-gl'), { reduced, mobile: window.matchMedia('(pointer: coarse)').matches || innerWidth < 860 }))
    .then((api) => { engineApi = api })
    .catch((err) => { console.warn('3D двигателя недоступно:', err); engineEl.classList.add('is-flat') }) // E5
}, { rootMargin: '150% 0px' })
engineLoadObs.observe(engineEl)

// ── R11: бегущие строки — едут сами и ускоряются от прокрутки
const marquees = [...document.querySelectorAll('[data-marquee]')].map((el) => {
  el.innerHTML = el.innerHTML.repeat(4)
  return { el, x: 0, dir: Number(el.dataset.dir || 1) }
})
let lastScroll = window.scrollY
let boost = 0
hooks.push((time, dt) => {
  const v = (window.scrollY - lastScroll) / Math.max(dt, 0.001)
  lastScroll = window.scrollY
  if (reduced) return
  boost += (Math.min(Math.abs(v), 3000) / 3000 * 6 - boost) * (1 - Math.exp(-dt * 4))
  marquees.forEach((m) => {
    const w = m.el.scrollWidth / 4
    m.x -= m.dir * dt * 60 * (1 + boost)
    if (m.x < -w) m.x += w
    if (m.x > 0) m.x -= w
    m.el.style.transform = `translate3d(${m.x}px,0,0)`
  })
})

// ── R11: счётчики
const fmt = (v, d) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return
    counterObs.unobserve(en.target)
    const el = en.target
    const to = Number(el.dataset.count)
    const d = Number(el.dataset.decimals || 0)
    if (reduced) return void (el.textContent = fmt(to, d))
    const t0 = performance.now()
    const step = (now) => {
      const t = clamp01((now - t0) / 1800)
      el.textContent = fmt(to * (1 - Math.pow(1 - t, 3)), d)
      if (t < 1) requestAnimationFrame(step)
    }
    el.textContent = fmt(0, d)
    requestAnimationFrame(step)
  })
}, { threshold: 0.6 })
document.querySelectorAll('[data-count]').forEach((el) => counterObs.observe(el))

// ── R11: заголовки по буквам (только с GSAP и без reduced motion)
if (hasGsap && !reduced) {
  const { gsap } = window
  document.querySelectorAll('.after h2').forEach((h) => {
    const words = h.innerHTML.split(/(<[^>]+>|\s+)/).filter((s) => s !== '')
    h.innerHTML = words.map((w) => (w.startsWith('<') || /^\s+$/.test(w) ? w : `<span style="display:inline-block;white-space:nowrap">${[...w].map((c) => `<span class="split-char">${c}</span>`).join('')}</span>`)).join('')
    const chars = h.querySelectorAll('.split-char')
    gsap.set(chars, { yPercent: 110, opacity: 0, rotate: 8 })
    window.ScrollTrigger.create({
      trigger: h, start: 'top 90%', once: true,
      onEnter: () => gsap.to(chars, { yPercent: 0, opacity: 1, rotate: 0, duration: 0.9, ease: 'expo.out', stagger: 0.022 }),
    })
  })
  // строки прайса: линия прорисовывается после появления строки
  gsap.utils.toArray('.pricelist li').forEach((li, i) => {
    gsap.set(li, { '--line': 0 })
    window.ScrollTrigger.create({ trigger: li, start: 'top 92%', once: true, onEnter: () => gsap.to(li, { '--line': 1, duration: 1.2, delay: 0.15 + i * 0.05, ease: 'power2.out' }) })
  })
}

// ── анимации появления (N3, E3)
if (hasGsap && !reduced) {
  const { gsap, ScrollTrigger } = window
  gsap.registerPlugin(ScrollTrigger)
  document.documentElement.classList.add('js-anim')
  const show = (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.1, overwrite: true })
  window.addEventListener('asto:ready', () => gsap.to('.hero [data-reveal]', { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1 }), { once: true })
  ScrollTrigger.batch('.after [data-reveal]', { start: 'top 88%', once: true, onEnter: show })
  const revealPassed = () => {
    const passed = gsap.utils.toArray('.after [data-reveal]').filter((el) => el.getBoundingClientRect().top < innerHeight * 0.88 && getComputedStyle(el).opacity === '0')
    if (passed.length) show(passed)
  }
  window.addEventListener('load', () => requestAnimationFrame(revealPassed))
  window.addEventListener('scroll', revealPassed, { passive: true })

  const steps = gsap.utils.toArray('[data-step]')
  gsap.set(steps, { '--line-scale': 0 })
  gsap.set(steps.map((s) => s.children), { opacity: 0, y: 24 })
  const tl = gsap.timeline({ scrollTrigger: { trigger: '.steps', start: 'top 80%', once: true } })
  steps.forEach((step, i) => {
    tl.to(step, { '--line-scale': 1, duration: 0.6, ease: 'power2.inOut' }, i * 0.3)
    tl.to(step.children, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.08 }, i * 0.3 + 0.15)
  })
}

// ── R5: загрузка
const loader = $('#loader')
const pctEl = $('#loader-pct')
const barEl = $('#loader-bar')
const setLoad = (p) => { pctEl.textContent = String(Math.round(p * 100)); barEl.style.transform = `scaleX(${p})` }
const finishLoading = () => {
  setLoad(1)
  setTimeout(() => { loader.classList.add('is-done'); window.dispatchEvent(new Event('asto:ready')) }, 250)
}
const fail = (err) => { console.warn('3D недоступно:', err); sceneEl.classList.add('is-failed'); finishLoading() }
initScene($('#gl'), setLoad).then((api) => { gl = api; finishLoading() }).catch(fail)

// ════════════════════════════════════════════════════════════════════
async function initScene(canvas, onProgress) {
  onProgress(0.05)
  const THREE = await import('three')
  const [{ GLTFLoader }, { DRACOLoader }, { RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ])
  onProgress(0.25)

  const mobile = window.matchMedia('(pointer: coarse)').matches || innerWidth < 860
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' }) // без WebGL → ошибка → E1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 120)

  // фон: тёмно-синий градиент с голубым свечением сверху
  const bgc = document.createElement('canvas')
  bgc.width = 16; bgc.height = 512
  const bg2 = bgc.getContext('2d')
  const grad = bg2.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, '#0b2448'); grad.addColorStop(0.5, '#07142a'); grad.addColorStop(1, '#040912')
  bg2.fillStyle = grad; bg2.fillRect(0, 0, 16, 512)
  const bgTex = new THREE.CanvasTexture(bgc)
  bgTex.colorSpace = THREE.SRGBColorSpace
  scene.background = bgTex
  scene.fog = new THREE.Fog(0x050b16, 10, 28)

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.85

  // пол-чертёж: светящаяся сетка + кольцо сканера
  const floorU = { uScanZ: { value: 99 }, uScanOn: { value: 0 }, uF: { value: 1 } }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({
    uniforms: floorU,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float uScanZ, uScanOn, uF;
      float ln(float c, float w){ float f = abs(fract(c - 0.5) - 0.5) / fwidth(c); return 1.0 - min(f / w, 1.0); }
      void main(){
        vec2 p = vW.xz;
        float fine = max(ln(p.x * 2.0, 1.0), ln(p.y * 2.0, 1.0));
        float big = max(ln(p.x * 0.4, 1.4), ln(p.y * 0.4, 1.4));
        float d = length(p);
        float fade = 1.0 - smoothstep(2.5, 15.0, d);
        vec3 col = vec3(0.02, 0.04, 0.08);
        col += vec3(0.3, 0.79, 1.0) * (fine * 0.12 + big * 0.45) * fade;
        float scan = exp(-pow((vW.z * uF - uScanZ) / 0.06, 2.0)) * uScanOn * (1.0 - smoothstep(1.5, 6.0, abs(p.x)));
        col += vec3(0.3, 0.85, 1.0) * scan * 1.4;
        col += vec3(0.3, 0.79, 1.0) * 0.06 * (1.0 - smoothstep(0.0, 4.0, d));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // полосы света: голубые по бокам, оранжевые спереди и сзади
  const glowMat = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false, fog: false }); m.color.multiplyScalar(k); return m }
  const cyanMat = glowMat(0x4cc9ff, 2.4)
  const orangeMat = glowMat(0xff7a1a, 2.6)
  ;[-3.4, 3.4].forEach((x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 10), cyanMat); b.position.set(x, 0.015, 0); scene.add(b) })
  ;[-5, 5].forEach((z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.03, 0.05), orangeMat); b.position.set(0, 0.015, z); scene.add(b) })
  const softMat = glowMat(0xdff4ff, 1.6)
  ;[-1.2, 1.2].forEach((x) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 6), softMat); s.rotation.x = Math.PI / 2; s.position.set(x, 4.6, 0); scene.add(s) })
  const cyanLight = new THREE.PointLight(0x4cc9ff, 5, 9, 1.6)
  cyanLight.position.set(-2.5, 1.2, 0)
  scene.add(cyanLight)
  const orangeLight = new THREE.PointLight(0xff7a1a, 0, 6, 1.6)
  scene.add(orangeLight)

  let dust = null
  if (!reduced) {
    const count = mobile ? 240 : 600
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) { arr[i * 3] = (Math.random() - 0.5) * 14; arr[i * 3 + 1] = Math.random() * 4.5; arr[i * 3 + 2] = (Math.random() - 0.5) * 14 }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfeaff, size: mobile ? 0.03 : 0.022, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }))
    scene.add(dust)
  }

  // ── машина
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/')
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('assets/ferrari.glb', (e) => { if (e.total) onProgress(0.25 + 0.65 * (e.loaded / e.total)) })
  const car = gltf.scene.children[0]
  scene.add(car)
  car.updateMatrixWorld(true)

  const wp = (o) => o.getWorldPosition(new THREE.Vector3())
  const F = Math.sign(wp(car.getObjectByName('wheel_fl')).z) || 1
  floorU.uF.value = F
  const bbox = new THREE.Box3().setFromObject(car)
  const zFront = F > 0 ? bbox.max.z : -bbox.min.z
  const zBack = F > 0 ? bbox.min.z : -bbox.max.z

  // краска: потёртое серебро → оранжевый металлик (гл. 5) + рентген за линией сканера (гл. 2)
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xff6a12, metalness: 0.75, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true })
  const U = { uScan: { value: 0 }, uXray: { value: 0 }, uPaint: { value: 0 }, uF: { value: F }, uZmin: { value: zBack }, uZmax: { value: zFront }, uTime: { value: 0 } }
  paint.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uScan, uXray, uPaint, uF, uZmin, uZmax, uTime;
        float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float actv(float x) { return step(0.001, x) * step(x, 0.999); }
        float gridLine(float c) { float f = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4); return 1.0 - min(f, 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float zn = (vWPos.z * uF - uZmin) / (uZmax - uZmin);
        // покраска: полоса идёт спереди назад
        float pn = vnoise(vWPos * 4.0) * 0.12;
        float pe = mix(1.15, -0.15, uPaint);
        float pm = smoothstep(pe - 0.01, pe + 0.01, zn + pn - 0.06);
        vec3 worn = vec3(0.42, 0.43, 0.45) * (0.82 + 0.3 * vnoise(vWPos * 30.0));
        diffuseColor.rgb = mix(worn, diffuseColor.rgb, pm);
        float pband = (1.0 - smoothstep(0.0, 0.025, abs(zn + pn - 0.06 - pe))) * actv(uPaint);
        // рентген: всё, что сканер уже прошёл (спереди), становится полупрозрачным чертежом
        float se = mix(1.15, -0.15, uScan);
        float xr = step(se, zn) * uXray;
        float sband = (1.0 - smoothstep(0.0, 0.02, abs(zn - se))) * actv(uScan) * uXray;
        vec3 vdir = normalize(cameraPosition - vWPos);
        float gx = max(gridLine(vWPos.x * 5.0), max(gridLine(vWPos.y * 5.0), gridLine(vWPos.z * 5.0)));
        diffuseColor.a = mix(1.0, 0.12, xr);
        vec3 glowCol = vec3(0.3, 0.8, 1.0) * gx * xr * 0.55 + vec3(0.5, 0.9, 1.0) * sband * 3.0 + vec3(1.0, 0.45, 0.1) * pband * 3.0;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.55, roughnessFactor, pm);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nfloat fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);\nglowCol += vec3(0.3, 0.8, 1.0) * fres * xr * 1.6;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowCol;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= pm;\n#endif')
  }
  car.getObjectByName('body').material = paint

  const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.3 })
  ;['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach((n) => { const o = car.getObjectByName(n); if (o) o.material = metal })
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1626, metalness: 0.2, roughness: 0, transparent: true, opacity: 0.32, depthWrite: false })
  car.getObjectByName('glass').material = glass

  const ao = new THREE.TextureLoader().load('assets/ferrari_ao.png')
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.004
  shadow.renderOrder = 2
  car.add(shadow)

  // свои материалы для деталей, которые светятся (тормоза, фары, неисправное колесо)
  const ownMaterials = (root) => { const list = []; root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); list.push(o.material) } }); return list }
  const meshesUnder = (name) => { const out = []; car.traverse((o) => { if (o.name === name) o.traverse((m) => m.isMesh && out.push(m)) }); return out }
  const brakeMats = []
  meshesUnder('brake').forEach((m) => { m.material = m.material.clone(); brakeMats.push(m.material) })
  const headMats = [...meshesUnder('lights'), ...meshesUnder('leds')].map((m) => (m.material = m.material.clone()))
  const tailMats = meshesUnder('lights_red').map((m) => (m.material = m.material.clone()))

  // ── разлёт: для каждой детали направление смещения в мире → смещение в координатах её родителя
  const exploders = []
  const addExplode = (name, dir) => {
    car.traverse((o) => {
      if (o.name !== name || !o.parent) return
      const base = o.position.clone()
      const w0 = wp(o)
      const a = o.parent.worldToLocal(w0.clone())
      const b = o.parent.worldToLocal(w0.clone().add(dir))
      exploders.push({ o, base, delta: b.sub(a) })
    })
  }
  const up = (y, z = 0) => new THREE.Vector3(0, y, z * F)
  ;['body', 'trim', 'chrome', 'grills', 'carbon fibre', 'carbon_fibre_trim', 'plastic_gray', 'metal', 'blue', 'yellow_trim'].forEach((n) => addExplode(n, up(0.95)))
  addExplode('glass', up(1.45))
  addExplode('wipers', up(1.25, 0.35))
  addExplode('lights', up(0.85, 0.75))
  addExplode('leds', up(0.85, 0.75))
  addExplode('lights_red', up(0.85, -0.75))
  addExplode('steering_wheel', up(0.45))

  const wheelNames = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
  const wheels = wheelNames.map((n) => car.getObjectByName(n))
  const wheelInfo = wheels.map((w) => {
    const p = wp(w)
    const side = Math.sign(p.x) || 1
    const front = Math.sign(p.z * F) || 1
    const dir = new THREE.Vector3(side * 0.95, 0, front * 0.3 * F)
    const a = w.parent.worldToLocal(p.clone())
    const out1 = w.parent.worldToLocal(p.clone().add(dir)).sub(a)
    const extra = w.parent.worldToLocal(p.clone().add(new THREE.Vector3(side * 1.0, 0, 0))).sub(a)
    const lift = w.parent.worldToLocal(p.clone().add(new THREE.Vector3(side * 0.6, 1.6, 0))).sub(a)
    return { w, p, side, front, base: w.position.clone(), out1, extra, lift }
  })
  // неисправное — заднее колесо со стороны камеры (x < 0); подсвечиваем его шину
  const badIdx = wheelInfo.findIndex((i) => i.front < 0 && i.side < 0)
  const frontIdx = wheelInfo.findIndex((i) => i.front > 0 && i.side < 0)
  const bad = wheelInfo[badIdx]
  const badMats = ownMaterials(bad.w)
  const fresh = bad.w.clone(true)
  const freshMats = ownMaterials(fresh)
  bad.w.parent.add(fresh)
  const steer = wp(car.getObjectByName('steering_wheel'))

  // ── маршрут камеры
  const V = (x, y, z) => new THREE.Vector3(x, y, z * F)
  const explodedPos = (i) => i.p.clone().add(new THREE.Vector3(i.side * 0.95, 0, i.front * 0.3 * F))
  const rw = explodedPos(bad)
  const fw = explodedPos(wheelInfo[frontIdx]).add(new THREE.Vector3(-1.0, 0, 0))
  const KEYS = [
    { u: 0.0, p: V(4.6, 1.5, 5.0), t: V(0, 0.55, 0), s: 1 },
    { u: 0.1, p: V(3.9, 1.2, 4.3), t: V(0, 0.5, 0), s: 1 },
    { u: 0.21, p: V(2.6, 2.5, 5.0), t: V(0, 0.5, 0.4), s: 1 },
    { u: 0.3, p: V(-4.9, 1.4, 1.2), t: V(0, 0.5, 0), s: 1.2 },
    { u: 0.4, p: V(-4.6, 1.7, -2.2), t: V(0, 0.6, -0.4), s: 1.2 },
    { u: 0.48, p: V(5.4, 3.6, 3.8), t: V(0, 1.0, 0), s: 1 },
    { u: 0.56, p: rw.clone().add(V(-2.6, 0.7, -1.8)), t: rw.clone().add(new THREE.Vector3(-0.4, 0.1, 0)), s: 0.85 },
    { u: 0.65, p: fw.clone().add(V(-2.0, 0.4, 1.3)), t: fw.clone().add(new THREE.Vector3(0.2, 0, 0)), s: 0.8 },
    { u: 0.73, p: fw.clone().add(V(-1.3, 0.25, 0.55)), t: fw.clone().add(new THREE.Vector3(0.25, 0, 0)), s: 0.75 },
    { u: 0.81, p: V(3.8, 2.6, 4.4), t: V(0, 0.7, 0), s: 1 },
    { u: 0.89, p: V(-4.7, 0.9, 0.6), t: V(0, 0.5, 0), s: 1.2 },
    { u: 0.95, p: V(1.1, 0.6, 5.7), t: V(0, 0.5, 0.4), s: 1 },
    { u: 1.0, p: V(3.9, 2.0, 5.8), t: V(0, 0.5, 0), s: 1 },
  ]
  let posCurve, tgtCurve
  const buildPath = () => {
    const k = Math.min(2.6, Math.max(1, 0.98 / camera.aspect))
    posCurve = new THREE.CatmullRomCurve3(KEYS.map((key) => key.t.clone().add(key.p.clone().sub(key.t).multiplyScalar(1 + (k - 1) * key.s))), false, 'centripetal')
    tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((key) => key.t.clone()), false, 'centripetal')
  }
  const paramAt = (u) => {
    let i = 0
    while (i < KEYS.length - 2 && u > KEYS[i + 1].u) i++
    const t = range(u, KEYS[i].u, KEYS[i + 1].u)
    return (i + mix(t, smooth(t), 0.6)) / (KEYS.length - 1)
  }

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 0.88)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  let W = 0
  let H = 0
  let baseFov = 36
  const resize = () => {
    W = innerWidth
    H = innerHeight
    renderer.setSize(W, H, false)
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(W, H)
    camera.aspect = W / H
    baseFov = camera.aspect < 1 ? mix(36, 52, clamp01((1 - camera.aspect) / 0.5)) : 36
    camera.updateProjectionMatrix()
    buildPath()
  }
  resize()
  window.addEventListener('resize', resize) // E2

  const tmpP = new THREE.Vector3()
  const tmpT = new THREE.Vector3()
  const look = { x: 0, y: 0 }
  const red = new THREE.Color(0xff2a2a)
  const orange = new THREE.Color(0xff7a1a)
  const white = new THREE.Color(0xffffff)

  function render(u, time, dt, ptr) {
    // ── камера
    const q = paramAt(u)
    posCurve.getPoint(q, tmpP)
    tgtCurve.getPoint(q, tmpT)
    look.x += (ptr.x - look.x) * (1 - Math.exp(-dt * 3))
    look.y += (ptr.y - look.y) * (1 - Math.exp(-dt * 3))
    tmpP.x += look.x * 0.35
    tmpP.y -= look.y * 0.18
    if (!reduced && u < 0.12) {
      const ang = Math.sin(time * 0.35) * (1 - u / 0.12) * 0.07
      const dx = tmpP.x - tmpT.x
      const dz = tmpP.z - tmpT.z
      tmpP.x = tmpT.x + dx * Math.cos(ang) - dz * Math.sin(ang)
      tmpP.z = tmpT.z + dx * Math.sin(ang) + dz * Math.cos(ang)
    }
    camera.position.copy(tmpP)
    camera.lookAt(tmpT)
    camera.fov = baseFov
    camera.updateProjectionMatrix()
    const wide = camera.aspect >= 1
    camera.setViewOffset(W, H, wide ? -W * 0.12 : 0, wide ? 0 : H * 0.11, W, H)

    // ── гл. 2: сканер и рентген, неисправности красным
    const scan = smooth(range(u, 0.18, 0.36))
    const xray = 1 - smooth(range(u, 0.8, 0.86))
    U.uScan.value = scan
    U.uXray.value = scan > 0 ? xray : 0
    floorU.uScanZ.value = mix(zFront + 0.3, zBack - 0.3, scan)
    floorU.uScanOn.value = scan > 0 && scan < 1 ? 1 : 0
    glass.opacity = mix(0.32, 0.08, smooth(range(u, 0.24, 0.36)) * xray)
    const problem = range(u, 0.3, 0.36) * (1 - range(u, 0.5, 0.55))
    const pulse = 0.7 + 0.3 * Math.sin(time * 2.4)

    // ── гл. 3: разлёт и замена колеса
    const explode = smooth(range(u, 0.42, 0.5)) * (1 - smooth(range(u, 0.8, 0.87)))
    exploders.forEach((e) => e.o.position.copy(e.base).addScaledVector(e.delta, explode))
    const frontOff = smooth(range(u, 0.62, 0.66)) * (1 - smooth(range(u, 0.76, 0.8)))
    wheelInfo.forEach((i, idx) => {
      i.w.position.copy(i.base).addScaledVector(i.out1, explode)
      if (idx === frontIdx) i.w.position.addScaledVector(i.extra, frontOff)
      i.w.rotation.x = -u * 24
    })
    const oldOut = smooth(range(u, 0.5, 0.54))
    const swapped = u > 0.54
    bad.w.visible = !swapped
    bad.w.position.addScaledVector(bad.lift, oldOut)
    fresh.visible = swapped
    const freshIn = 1 - smooth(range(u, 0.54, 0.6))
    fresh.position.copy(bad.base).addScaledVector(bad.out1, explode).addScaledVector(bad.lift, freshIn)
    fresh.rotation.x = bad.w.rotation.x
    badMats.forEach((m) => { m.emissive = m.emissive || new THREE.Color(); m.emissive.copy(red); m.emissiveIntensity = (problem * pulse + oldOut) * 0.9 })
    const freshGlow = swapped ? 1 - smooth(range(u, 0.58, 0.64)) : 0
    freshMats.forEach((m) => { m.emissive = m.emissive || new THREE.Color(); m.emissive.copy(orange); m.emissiveIntensity = freshGlow * 1.6 })

    // ── гл. 4: раскалённый тормозной диск
    const heat = smooth(range(u, 0.64, 0.69)) * (1 - smooth(range(u, 0.71, 0.78)))
    brakeMats.forEach((m) => {
      m.emissive = m.emissive || new THREE.Color()
      if (problem > 0.01 && heat < 0.01) { m.emissive.copy(red); m.emissiveIntensity = problem * pulse * 1.3 } else { m.emissive.copy(orange); m.emissiveIntensity = heat * 3 }
    })
    orangeLight.position.copy(fw).add(new THREE.Vector3(-0.3, 0.1, 0))
    orangeLight.intensity = heat * 4

    // ── гл. 5: покраска и фары
    U.uPaint.value = smooth(range(u, 0.85, 0.95))
    const lights = smooth(range(u, 0.94, 0.99))
    headMats.forEach((m) => { m.emissive = m.emissive || new THREE.Color(); m.emissive.copy(white); m.emissiveIntensity = lights * 1.2 })
    tailMats.forEach((m) => { m.emissive = m.emissive || new THREE.Color(); m.emissive.copy(red); m.emissiveIntensity = lights * 2.5 })
    cyanLight.intensity = 5 * xray + 1.5

    if (dust) {
      const arr = dust.geometry.attributes.position.array
      for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * 0.08; if (arr[i] > 4.5) arr[i] = 0 }
      dust.geometry.attributes.position.needsUpdate = true
      dust.rotation.y = time * 0.02
    }
    composer.render()
  }

  render(journeyU(), 0, 0.016, { x: 0, y: 0 })
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera)
  onProgress(1)
  window.__asto = { renderer, camera }
  return { render }
}
