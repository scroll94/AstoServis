// R10: рядная «четвёрка» (модель «Four Cylinder Engine», ChinmaySingh, Sketchfab, CC BY).
// Модель цельная, поэтому «по частям» = разрез вдоль мотора (срезы красные, как на техническом рендере)
// + камера облетает узлы по очереди, текущий узел подсвечивается оранжевым прямо на модели.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const range = (v, a, b) => clamp01((v - a) / (b - a))
const smooth = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t

const CUT = [0.08, 0.26]
export const PART_AT = [0.3, 0.42, 0.52, 0.62, 0.72, 0.82]
// зоны узлов в долях габарита модели (x — ширина, y — высота, z — длина)
const ZONES = [
  { x: [0, 1], y: [0.86, 1], z: [0, 1] }, // клапанная крышка и распредвалы
  { x: [0, 1], y: [0.68, 0.87], z: [0, 1] }, // головка блока
  { x: [0.72, 1], y: [0.45, 0.9], z: [0.05, 0.95] }, // впуск, выпуск, турбина (бок)
  { x: [0.2, 0.8], y: [0.36, 0.68], z: [0.05, 0.95] }, // поршни и шатуны
  { x: [0, 1], y: [0, 0.36], z: [0, 1] }, // коленвал и поддон
  { x: [0, 1], y: [0, 1], z: [0, 0.12] }, // ремень ГРМ и шкивы (торец)
]

export async function createEngine(canvas, { reduced, mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85
  renderer.localClippingEnabled = true
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.7
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 100)
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(4, 6, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x4cc9ff, 2.2)
  rim.position.set(-4, 2, -4)
  scene.add(rim)

  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/')
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('assets/engine4.glb')
  const model = gltf.scene
  const box0 = new THREE.Box3().setFromObject(model)
  const size0 = box0.getSize(new THREE.Vector3())
  const s = 2.4 / Math.max(size0.x, size0.y, size0.z)
  model.scale.setScalar(s)
  model.position.copy(box0.getCenter(new THREE.Vector3()).multiplyScalar(-s))
  const holder = new THREE.Group()
  holder.add(model)
  scene.add(holder)
  holder.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(holder)
  const size = box.getSize(new THREE.Vector3())

  // разрез по ширине: оставляем половину мотора, смотрим на срез со стороны +x
  const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), box.max.x + 0.05)

  const U = {
    uMin: { value: box.min.clone() }, uSize: { value: size.clone() },
    uZmin: { value: new THREE.Vector3() }, uZmax: { value: new THREE.Vector3(1, 1, 1) }, uHi: { value: 0 }, uTime: { value: 0 },
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.33, side: THREE.DoubleSide, clippingPlanes: [plane] })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP;
        uniform vec3 uMin, uSize, uZmin, uZmax; uniform float uHi, uTime;
        float band(float v, float a, float b) { return smoothstep(a - 0.03, a + 0.01, v) * (1.0 - smoothstep(b - 0.01, b + 0.03, v)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 n01 = (vWP - uMin) / uSize;
        // «материалы» по высоте: низ — тёмный чугун, середина — сталь, верх — светлый алюминий
        vec3 lowC = vec3(0.16, 0.18, 0.21), midC = vec3(0.42, 0.46, 0.52), topC = vec3(0.66, 0.69, 0.73);
        diffuseColor.rgb = mix(mix(lowC, midC, smoothstep(0.18, 0.42, n01.y)), topC, smoothstep(0.62, 0.8, n01.y));
        float zone = band(n01.x, uZmin.x, uZmax.x) * band(n01.y, uZmin.y, uZmax.y) * band(n01.z, uZmin.z, uZmax.z);
        vec3 glowCol = vec3(1.0, 0.45, 0.1) * zone * uHi * (0.55 + 0.25 * sin(uTime * 2.0));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowCol;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif (!gl_FrontFacing) gl_FragColor = vec4(0.93, 0.07, 0.06, 1.0);')
  }
  model.traverse((o) => { if (o.isMesh) o.material = mat })

  // ── маршрут камеры: общий план → бок (срез) → по зонам узлов → общий план
  const P = (nx, ny, nz) => new THREE.Vector3(box.min.x + size.x * nx, box.min.y + size.y * ny, box.min.z + size.z * nz)
  const zoneCenter = (z) => P((z.x[0] + z.x[1]) / 2, (z.y[0] + z.y[1]) / 2, (z.z[0] + z.z[1]) / 2)
  const side = (t, dx, dy, dz) => t.clone().add(new THREE.Vector3(dx, dy, dz))
  const zc = ZONES.map(zoneCenter)
  const KEYS = [
    { u: 0.0, t: P(0.5, 0.5, 0.5), p: P(0.5, 0.5, 0.5).add(new THREE.Vector3(2.6, 1.6, 2.6)) },
    { u: 0.26, t: P(0.45, 0.5, 0.5), p: P(0.45, 0.5, 0.5).add(new THREE.Vector3(3.6, 0.6, 0.9)) },
    { u: 0.3, t: zc[0], p: side(zc[0], 2.0, 1.2, 0.8) },
    { u: 0.42, t: zc[1], p: side(zc[1], 2.2, 0.6, -0.6) },
    { u: 0.52, t: zc[2], p: side(zc[2], 2.0, 0.3, 1.0) },
    { u: 0.62, t: zc[3], p: side(zc[3], 2.4, 0.1, -0.4) },
    { u: 0.72, t: zc[4], p: side(zc[4], 2.4, -0.3, 0.6) },
    { u: 0.82, t: zc[5], p: side(zc[5], 1.4, 0.4, -2.2) },
    { u: 1.0, t: P(0.5, 0.5, 0.5), p: P(0.5, 0.5, 0.5).add(new THREE.Vector3(3.2, 1.8, -2.4)) },
  ]
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.p), false, 'centripetal')
  const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.t), false, 'centripetal')
  const paramAt = (u) => {
    let i = 0
    while (i < KEYS.length - 2 && u > KEYS[i + 1].u) i++
    const t = range(u, KEYS[i].u, KEYS[i + 1].u)
    return (i + mix(t, smooth(t), 0.6)) / (KEYS.length - 1)
  }

  let camK = 1
  const resize = () => {
    const r = canvas.getBoundingClientRect()
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false)
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height)
    camK = Math.max(1, 1.05 / camera.aspect)
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  const tp = new THREE.Vector3()
  const tt = new THREE.Vector3()
  let shownZone = -1

  function render(e, dt, time, look) {
    plane.constant = mix(box.max.x + 0.05, mix(box.min.x, box.max.x, 0.52), smooth(range(e, CUT[0], CUT[1])))
    let active = -1
    PART_AT.forEach((p, i) => { if (e >= p - 0.02) active = i })
    // подсветка: зона плавно переключается — гаснет старая, загорается новая
    const target = active >= 0 && e < 0.94 ? 1 : 0
    if (active !== shownZone) {
      U.uHi.value += (0 - U.uHi.value) * (1 - Math.exp(-dt * 10))
      if (U.uHi.value < 0.05) {
        shownZone = active
        if (active >= 0) { U.uZmin.value.set(ZONES[active].x[0], ZONES[active].y[0], ZONES[active].z[0]); U.uZmax.value.set(ZONES[active].x[1], ZONES[active].y[1], ZONES[active].z[1]) }
      }
    } else {
      U.uHi.value += (target - U.uHi.value) * (1 - Math.exp(-dt * 4))
    }
    U.uTime.value = time

    const q = paramAt(e)
    posCurve.getPoint(q, tp)
    tgtCurve.getPoint(q, tt)
    tp.sub(tt).multiplyScalar(camK * 1.55).add(tt)
    if (look) { tp.x += look.x * 0.15; tp.y -= look.y * 0.1 }
    camera.position.copy(tp)
    camera.lookAt(tt)
    holder.rotation.y = reduced ? 0 : Math.sin(time * 0.3) * 0.03
    renderer.render(scene, camera)
    return { active, stage: e < CUT[0] ? 'whole' : e < CUT[1] ? 'cut' : 'apart' }
  }
  render(0, 0.016, 0, null)
  return { render, resize }
}
