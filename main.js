// GLOSS — кинематографичный 3D-пролёт по прокрутке + обычные блоки.
// Текст и карточки работают и без WebGL/GSAP (E1, E3): 3D подгружается отдельно и может упасть без последствий.
const $ = (s) => document.querySelector(s)
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const range = (v, a, b) => clamp01((v - a) / (b - a))
const smooth = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined'

// ── главы пролёта: где начинается каждая (доля прокрутки блока #journey)
const CHAPTERS = [0, 0.24, 0.47, 0.6, 0.78]
const CARDS = { 1: [0.2, 0.43], 2: [0.45, 0.56], 3: [0.575, 0.7], 4: [0.8, 0.95] }

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

// ── геометрия пролёта
const journey = $('#journey')
let jTop = 0
let jLen = 1
const measure = () => {
  jTop = journey.offsetTop
  jLen = Math.max(1, journey.offsetHeight - window.innerHeight)
}
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

// ── R4: индикатор глав
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
  sceneEl.classList.toggle('is-off', !inJourney)
  chapterBtns.forEach((b, i) => (i === chapter ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')))
  cards.forEach((c, i) => c.classList.toggle('is-on', on[i]))
}

// ── главный цикл: прокрутка → сглаженный прогресс → HUD и 3D
let uShown = journeyU()
let gl = null // появится, если 3D загрузилось
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
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ── анимации появления (N3: нет при reduced motion; E3: без GSAP всё видно)
if (hasGsap && !reduced) {
  const { gsap, ScrollTrigger } = window
  gsap.registerPlugin(ScrollTrigger)
  document.documentElement.classList.add('js-anim')
  const show = (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.1, overwrite: true })
  const heroIn = () => gsap.to('.hero [data-reveal]', { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1 })
  window.addEventListener('gloss:ready', heroIn, { once: true })
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

// ── R6: ползунок до / после
const box = $('#compare-box')
const handle = $('#compare-handle')
let pos = 50
const setPos = (v) => {
  pos = Math.min(100, Math.max(0, v))
  box.style.setProperty('--pos', pos + '%')
  handle.setAttribute('aria-valuenow', String(Math.round(pos)))
}
const fromPointer = (e) => { const r = box.getBoundingClientRect(); setPos(((e.clientX - r.left) / r.width) * 100) }
let dragging = false
box.addEventListener('pointerdown', (e) => { dragging = true; box.setPointerCapture(e.pointerId); fromPointer(e) })
box.addEventListener('pointermove', (e) => dragging && fromPointer(e))
box.addEventListener('pointerup', () => (dragging = false))
box.addEventListener('pointercancel', () => (dragging = false))
handle.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 10 : 2
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setPos(pos - step)
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setPos(pos + step)
  else if (e.key === 'Home') setPos(0)
  else if (e.key === 'End') setPos(100)
  else return
  e.preventDefault()
})

// ── R5: загрузка
const loader = $('#loader')
const pctEl = $('#loader-pct')
const barEl = $('#loader-bar')
const setLoad = (p) => { pctEl.textContent = String(Math.round(p * 100)); barEl.style.transform = `scaleX(${p})` }
const finishLoading = () => {
  setLoad(1)
  setTimeout(() => { loader.classList.add('is-done'); window.dispatchEvent(new Event('gloss:ready')) }, 250)
}
const fail = (err) => {
  console.warn('3D недоступно:', err)
  sceneEl.classList.add('is-failed')
  finishLoading()
}

initScene($('#gl'), setLoad).then((api) => { gl = api; finishLoading() }).catch(fail)

// ════════════════════════════════════════════════════════════════════
// 3D
async function initScene(canvas, onProgress) {
  onProgress(0.05)
  const THREE = await import('three')
  const [{ GLTFLoader }, { DRACOLoader }, { RoomEnvironment }, { Reflector }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
    await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/objects/Reflector.js'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ])
  onProgress(0.25)

  const mobile = window.matchMedia('(pointer: coarse)').matches || innerWidth < 860
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' }) // бросит ошибку без WebGL → E1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5)) // N2
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 120)
  camera.layers.enable(1)

  // фон-студия: тёмный градиент с красным свечением сверху
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = 16; bgCanvas.height = 512
  const g = bgCanvas.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, '#190508'); grad.addColorStop(0.45, '#0b0a0e'); grad.addColorStop(1, '#050506')
  g.fillStyle = grad; g.fillRect(0, 0, 16, 512)
  const bg = new THREE.CanvasTexture(bgCanvas)
  bg.colorSpace = THREE.SRGBColorSpace
  scene.background = bg
  scene.fog = new THREE.Fog(0x060608, 9, 26)

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.9

  // зеркальный пол + затемнение по краям
  const reflScale = mobile ? 0.35 : 0.5
  const floor = new Reflector(new THREE.CircleGeometry(30, 64), {
    textureWidth: innerWidth * reflScale, textureHeight: innerHeight * reflScale, color: 0x8a8a8a, clipBias: 0.003,
  })
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const dimCanvas = document.createElement('canvas')
  dimCanvas.width = dimCanvas.height = 256
  const dg = dimCanvas.getContext('2d')
  const rg = dg.createRadialGradient(128, 128, 10, 128, 128, 128)
  rg.addColorStop(0, 'rgb(150,150,150)'); rg.addColorStop(0.35, 'rgb(190,190,190)'); rg.addColorStop(1, 'rgb(255,255,255)')
  dg.fillStyle = rg; dg.fillRect(0, 0, 256, 256)
  const dim = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshBasicMaterial({ color: 0x060608, transparent: true, alphaMap: new THREE.CanvasTexture(dimCanvas) }))
  dim.rotation.x = -Math.PI / 2
  dim.position.y = 0.001
  scene.add(dim)

  // софтбоксы над машиной и красные полосы света на полу (отражаются и светятся через bloom)
  const glowMat = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false, fog: false }); m.color.multiplyScalar(k); return m }
  const softMat = glowMat(0xffffff, 1.8)
  ;[-1.25, 0, 1.25].forEach((x) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 6.2), softMat)
    s.rotation.x = Math.PI / 2
    s.position.set(x, 4.6, 0)
    s.layers.set(1) // слой 1 видит только основная камера: в зеркале пола софтбоксы не отражаются и не лезут под текст
    scene.add(s)
  })
  const redMat = glowMat(0xff2d3d, 2.2)
  ;[-3.3, 3.3].forEach((x) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 10), redMat)
    bar.position.set(x, 0.015, 0)
    scene.add(bar)
  })
  const redLight = new THREE.PointLight(0xff2d3d, 6, 9, 1.6)
  redLight.position.set(0, 0.4, 0)
  scene.add(redLight)

  // N3: пыль в воздухе — только без reduced motion
  let dust = null
  if (!reduced) {
    const count = mobile ? 260 : 650
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) { arr[i * 3] = (Math.random() - 0.5) * 14; arr[i * 3 + 1] = Math.random() * 4.5; arr[i * 3 + 2] = (Math.random() - 0.5) * 14 }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd6d9, size: mobile ? 0.03 : 0.022, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
    scene.add(dust)
  }

  // ── машина
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/')
  const loader = new GLTFLoader().setDRACOLoader(draco)
  const gltf = await loader.loadAsync('assets/ferrari.glb', (e) => { if (e.total) onProgress(0.25 + 0.65 * (e.loaded / e.total)) })
  const car = gltf.scene.children[0]
  scene.add(car)

  // фронт машины: колесо «fl» стоит спереди
  const wfl = new THREE.Vector3()
  car.getObjectByName('wheel_fl').getWorldPosition(wfl)
  const F = Math.sign(wfl.z) || 1
  const bbox = new THREE.Box3().setFromObject(car)
  const zFront = F > 0 ? bbox.max.z : -bbox.min.z
  const zBack = F > 0 ? bbox.min.z : -bbox.max.z

  // краска: тусклая пыльная → зеркальный лак по светящемуся шву (+ сотовая плёнка и блик керамики)
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xc8101e, metalness: 0.7, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 })
  const U = { uBurn: { value: 0 }, uFilm: { value: 0 }, uSheen: { value: 0 }, uF: { value: F }, uZmin: { value: zBack }, uZmax: { value: zFront } }
  paint.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uBurn, uFilm, uSheen, uF, uZmin, uZmax;
        float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float hexLine(vec2 p) {
          p *= 9.0; vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h; vec2 q = abs(dot(a, a) < dot(b, b) ? a : b);
          return smoothstep(0.43, 0.5, max(dot(q, vec2(0.5, 0.866)), q.x));
        }
        float actv(float x) { return step(0.001, x) * step(x, 0.999); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float zn = (vWPos.z * uF - uZmin) / (uZmax - uZmin);
        float nz = vnoise(vWPos * 3.5) * 0.6 + vnoise(vWPos * 11.0) * 0.3;
        float sv = zn + (nz - 0.45) * 0.2;
        float edge = mix(1.18, -0.18, uBurn);
        float gm = smoothstep(edge - 0.012, edge + 0.012, sv);
        vec3 dull = vec3(0.13, 0.105, 0.1) * (0.88 + 0.24 * vnoise(vWPos * 40.0));
        diffuseColor.rgb = mix(dull, diffuseColor.rgb, gm);
        float band = (1.0 - smoothstep(0.0, 0.03, abs(sv - edge))) * actv(uBurn);
        vec3 glowCol = vec3(1.0, 0.16, 0.08) * band * 7.0 + vec3(1.0, 0.75, 0.5) * pow(band, 5.0) * 6.0;
        float fe = mix(1.18, -0.18, uFilm);
        float fb = (1.0 - smoothstep(0.0, 0.1, abs(zn - fe))) * actv(uFilm);
        glowCol += vec3(1.0, 0.45, 0.45) * hexLine(vec2(vWPos.x + vWPos.y * 0.7, vWPos.z)) * fb * 3.5;
        float se = mix(1.2, -0.2, uSheen);
        glowCol += vec3(1.0, 0.92, 0.9) * exp(-pow((zn - se) / 0.04, 2.0)) * actv(uSheen) * 1.2;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.9, roughnessFactor, gm);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= mix(0.1, 1.0, gm);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowCol;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= gm;\n#endif')
  }
  car.getObjectByName('body').material = paint

  const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.32 })
  ;['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach((n) => { const o = car.getObjectByName(n); if (o) o.material = metal })
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x111114, metalness: 0.2, roughness: 0, transparent: true, opacity: 0.32, depthWrite: false })
  car.getObjectByName('glass').material = glass

  // мягкая тень под машиной
  const ao = new THREE.TextureLoader().load('assets/ferrari_ao.png')
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.003
  shadow.renderOrder = 2
  car.add(shadow)

  const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => car.getObjectByName(n))
  const wheelBase = wheels.map((w) => w.position.clone())
  const wheelSide = wheels.map((w) => { const p = new THREE.Vector3(); w.getWorldPosition(p); return Math.sign(p.x) || 1 })
  // заднее колесо на стороне камеры (x < 0) и руль — опорные точки камеры
  const rear = wheels.map((w) => { const p = new THREE.Vector3(); w.getWorldPosition(p); return p }).filter((p) => p.z * F < 0).sort((a, b) => a.x - b.x)[0]
  const steer = new THREE.Vector3()
  car.getObjectByName('steering_wheel').getWorldPosition(steer)

  // ── салон как в настоящих машинах
  // материал «карбон» в модели без текстуры и рисовался светлым кольцом за рулём («второй руль») — делаем тёмный глянцевый карбон
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0x141518, metalness: 0.4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 })
  // сиденья, двери и тоннель — коньячная кожа, панель, пол и руль — тёмные (как в салоне McLaren)
  const recolor = { Leather: [0x8c4f2a, 0.55], Leather_red: [0x744122, 0.55], Interior_light: [0x26272b, 0.6], Interior_dark: [0x1b1c1f, 0.6], plastic_gray: [0x1c1d20, 0.55], Carpet: [0x141416, 0.9] }
  const inWheel = (o) => { for (let p = o; p; p = p.parent) if (p.name === 'steering_wheel') return true; return false }
  car.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const name = o.material.name
    if (name === 'Carbon_Fiber') o.material = carbon
    else if (recolor[name]) {
      const m = o.material.clone()
      m.color.setHex(inWheel(o) && name.startsWith('Leather') ? 0x18181b : recolor[name][0])
      m.roughness = recolor[name][1]
      m.metalness = 0
      o.material = m
    }
  })

  // ── маршрут камеры: ключевые точки с долей прокрутки u; s — можно отодвигать на узких экранах
  const V = (x, y, z) => new THREE.Vector3(x, y, z * F)
  const KEYS = [
    { u: 0.0, p: V(4.6, 1.55, 5.0), t: V(0, 0.55, 0), s: 1 },
    { u: 0.1, p: V(3.9, 1.15, 4.3), t: V(0, 0.5, 0), s: 1 },
    { u: 0.19, p: V(0.9, 0.45, 5.6), t: V(0, 0.45, 0.6), s: 1 },
    { u: 0.29, p: V(-4.7, 0.72, 2.0), t: V(0, 0.45, 0.2), s: 1.2 },
    { u: 0.41, p: V(-4.6, 0.95, -1.6), t: V(0, 0.45, -0.4), s: 1.2 },
    { u: 0.51, p: rear.clone().add(V(-2.1, 0.32, -1.5)), t: rear.clone().add(new THREE.Vector3(0, 0.02, 0)), s: 0.75 },
    { u: 0.63, p: V(-1.8, 0.72, zFront + 1.5), t: V(-0.5, 0.58, zFront - 0.35), s: 0.8 },
    { u: 0.72, p: V(0.3, 3.0, 3.4), t: V(0, 0.8, 0.3), s: 1 },
    { u: 0.79, p: new THREE.Vector3(0, steer.y + 0.5, steer.z + F * 1.3), t: steer.clone(), s: 0 },
    { u: 0.86, p: new THREE.Vector3(-steer.x * 1.1, steer.y + 0.36, steer.z - F * 0.62), t: new THREE.Vector3(steer.x * 0.7, steer.y - 0.02, steer.z + F * 0.1), s: 0 },
    { u: 0.93, p: new THREE.Vector3(-steer.x * 0.9, steer.y + 0.4, steer.z - F * 0.5), t: new THREE.Vector3(steer.x * 0.6, steer.y - 0.22, steer.z - F * 0.9), s: 0 },
    { u: 0.975, p: V(4.4, 3.1, -5.6), t: V(0, 0.5, 0), s: 1 },
    { u: 1.0, p: V(4.0, 2.7, -5.2), t: V(0, 0.5, 0), s: 1 },
  ]
  let posCurve, tgtCurve
  const buildPath = () => {
    const a = camera.aspect
    // на узком экране камера отъезжает настолько, чтобы машина целиком влезала по ширине (N1)
    const k = Math.min(2.6, Math.max(1, 0.98 / a))
    const ps = KEYS.map((key) => key.t.clone().add(key.p.clone().sub(key.t).multiplyScalar(mix(1, k, key.s))))
    posCurve = new THREE.CatmullRomCurve3(ps, false, 'centripetal')
    tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((key) => key.t.clone()), false, 'centripetal')
  }
  const paramAt = (u) => {
    let i = 0
    while (i < KEYS.length - 2 && u > KEYS[i + 1].u) i++
    const t = range(u, KEYS[i].u, KEYS[i + 1].u)
    return (i + mix(t, smooth(t), 0.6)) / (KEYS.length - 1)
  }

  // ── постобработка
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.5, 0.88)
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
    baseFov = camera.aspect < 1 ? mix(36, 52, clamp01((1 - camera.aspect) / 0.5)) : 36 // вертикальный экран — шире объектив
    camera.updateProjectionMatrix()
    floor.getRenderTarget().setSize(W * reflScale * renderer.getPixelRatio(), H * reflScale * renderer.getPixelRatio())
    buildPath()
  }
  resize()
  window.addEventListener('resize', resize) // E2

  const tmpP = new THREE.Vector3()
  const tmpT = new THREE.Vector3()
  const look = { x: 0, y: 0 }

  function render(u, time, dt, ptr) {
    // камера по маршруту
    const q = paramAt(u)
    posCurve.getPoint(q, tmpP)
    tgtCurve.getPoint(q, tmpT)
    const inside = smooth(range(u, 0.76, 0.81)) * (1 - smooth(range(u, 0.94, 0.98)))
    // R8: лёгкий параллакс от курсора (снаружи), N3: без авто-покачивания при reduced
    look.x += (ptr.x - look.x) * (1 - Math.exp(-dt * 3))
    look.y += (ptr.y - look.y) * (1 - Math.exp(-dt * 3))
    const out = 1 - inside
    tmpP.x += look.x * 0.35 * out
    tmpP.y -= look.y * 0.18 * out
    if (!reduced && u < 0.12) {
      const sway = (1 - u / 0.12) * 0.07
      const ang = Math.sin(time * 0.35) * sway
      const dx = tmpP.x - tmpT.x
      const dz = tmpP.z - tmpT.z
      tmpP.x = tmpT.x + dx * Math.cos(ang) - dz * Math.sin(ang)
      tmpP.z = tmpT.z + dx * Math.sin(ang) + dz * Math.cos(ang)
    }
    camera.position.copy(tmpP)
    camera.lookAt(tmpT)

    // кадрирование: на ПК машина правее (карточки слева), на телефоне выше (карточки снизу)
    const wide = camera.aspect >= 1
    camera.setViewOffset(W, H, wide ? -W * 0.12 * out : 0, wide ? 0 : H * 0.11 * out, W, H)

    // эффекты по главам
    U.uBurn.value = smooth(range(u, 0.2, 0.42))
    U.uSheen.value = range(u, 0.46, 0.57)
    U.uFilm.value = range(u, 0.575, 0.7)
    const wheelsOut = smooth(range(u, 0.44, 0.49)) * (1 - smooth(range(u, 0.55, 0.6)))
    wheels.forEach((w, i) => {
      w.position.copy(wheelBase[i])
      w.position.x += wheelSide[i] * wheelsOut * 0.28 / Math.max(car.scale.x, 1e-6)
      w.rotation.x = -u * 26
    })
    glass.opacity = mix(0.32, 0.12, inside)
    redLight.intensity = (6 + Math.sin(time * 1.4) * 0.8) * (1 - inside * 0.92)
    // в салоне: шире объектив, меньше экспозиция и свечение, иначе кабина пересвечена
    camera.fov = mix(baseFov, 62, inside)
    camera.updateProjectionMatrix()
    renderer.toneMappingExposure = mix(1.05, 0.85, inside)
    bloom.strength = mix(0.42, 0.15, inside)
    scene.environmentIntensity = mix(0.9, 0.75, inside)

    if (dust) {
      const arr = dust.geometry.attributes.position.array
      for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * 0.08; if (arr[i] > 4.5) arr[i] = 0 }
      dust.geometry.attributes.position.needsUpdate = true
      dust.rotation.y = time * 0.02
    }
    composer.render()
  }

  // компиляция шейдеров до показа, чтобы не было рывка на первом кадре
  render(journeyU(), 0, 0.016, { x: 0, y: 0 })
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera)
  onProgress(1)
  window.__gloss = { renderer, camera, scene, car }
  return { render }
}
