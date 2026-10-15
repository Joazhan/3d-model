import * as THREE from 'three'
import { AsciiEffect } from 'three/addons/effects/AsciiEffect.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const STATIC_RABBIT = [
  '   (\\_/)   ',
  '   ( o.o )  ',
  '  o (_)(_) o',
].join('\n')

// `ground: true` sits the model's feet/wheels on y=0 (for creatures and vehicles); otherwise
// the model is centered on all three axes (for free-floating things like a planet).
// `scale` is the default scale-slider multiplier — models get auto-fit to the same bounding
// size by their largest dimension, but a long, low car ends up looking much shorter than a
// tall rabbit as a result, so this nudges its default back up to a comparable visual size.
const MODELS = [
  { id: 'rabbit', label: 'Rabbit', path: './rabbit.glb', ground: true, scale: 1 },
  { id: 'supra', label: 'Supra', path: './toyota_supra.glb', ground: true, scale: 1.8 },
  { id: 'chicken', label: 'Chicken', path: './animated_chicken.glb', ground: true, scale: 1 },
]

const isMobile = window.matchMedia('(max-width: 767px)').matches

if (isMobile) {
  document.body.classList.add('is-mobile')
  document.getElementById('mobile-rabbit').textContent = STATIC_RABBIT
} else {
  init()
}

function init() {
  const container = document.getElementById('ascii-container')
  const resolutionSlider = document.getElementById('resolution-slider')
  const scaleSlider = document.getElementById('scale-slider')
  const copyButton = document.getElementById('copy-button')
  const resolutionValue = document.getElementById('resolution-value')
  const scaleValue = document.getElementById('scale-value')

  // Shows the slider's current numeric value next to it while the user is actively dragging
  // (pointer down through pointer up), instead of cluttering the UI with it permanently.
  function wireSliderValueDisplay(slider, valueEl) {
    const updateText = () => { valueEl.textContent = slider.value }
    slider.addEventListener('pointerdown', () => {
      updateText()
      valueEl.classList.add('visible')
    })
    slider.addEventListener('input', updateText)
    const hide = () => valueEl.classList.remove('visible')
    slider.addEventListener('pointerup', hide)
    slider.addEventListener('pointercancel', hide)
  }

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  const DEFAULT_CAMERA_POSITION = new THREE.Vector3(2.2, 1.1, 2.8)
  camera.position.copy(DEFAULT_CAMERA_POSITION)

  scene.add(new THREE.AmbientLight(0xffffff, 0.9))
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6)
  dirLight.position.set(3, 6, 4)
  scene.add(dirLight)

  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(window.innerWidth, window.innerHeight)

  // AsciiEffect bakes its character-density "resolution" in at construction time, so
  // adjusting the detail slider rebuilds the effect + controls rather than mutating them.
  let effect
  let controls
  let currentTarget = new THREE.Vector3(0, 0.4, 0)

  // AsciiEffect's font-size/letter-spacing approximation for a given resolution rarely lands
  // exactly on the target box width — depending on resolution it can render rows narrower
  // (leaving blank space on the right) or wider (getting clipped by the fixed-width,
  // overflow-hidden <td>). Rescale the rendered row to the box's actual width every frame so
  // it always fills edge to edge either way.
  function fixAsciiOverflow() {
    const td = effect.domElement.querySelector('td')
    if (!td) return

    const range = document.createRange()
    range.selectNodeContents(td)
    const contentWidth = range.getBoundingClientRect().width
    const boxWidth = td.getBoundingClientRect().width
    if (!contentWidth || Math.abs(contentWidth - boxWidth) < 0.5) return

    const scale = boxWidth / contentWidth
    td.innerHTML = `<span style="display:inline-block;transform-origin:0 0;transform:scaleX(${scale})">${td.innerHTML}</span>`
  }

  function buildView(resolution) {
    if (effect) container.removeChild(effect.domElement)
    if (controls) controls.dispose()

    effect = new AsciiEffect(renderer, ' .:-+*=%@#', { resolution, invert: true })
    effect.setSize(window.innerWidth, window.innerHeight)
    effect.domElement.style.color = 'white'
    effect.domElement.style.backgroundColor = 'black'
    container.appendChild(effect.domElement)

    controls = new OrbitControls(camera, effect.domElement)
    controls.target.copy(currentTarget)
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.1
    controls.minDistance = 1
    controls.maxDistance = 8
    controls.maxPolarAngle = Math.PI / 2.05
  }

  buildView(parseFloat(resolutionSlider.value))

  resolutionSlider.addEventListener('input', (e) => {
    currentTarget.copy(controls.target)
    buildView(parseFloat(e.target.value))
  })
  wireSliderValueDisplay(resolutionSlider, resolutionValue)

  // The ascii grid fills the whole viewport, but the model itself only occupies a small
  // patch of it — everything else is blank rows/columns. Crop to the tight bounding box of
  // non-blank content so a paste shows a compact image instead of the model lost in a sea
  // of whitespace.
  function cropAsciiArt(text) {
    const lines = text.split('\n')
    const isBlank = (line) => line.trim().length === 0

    let top = lines.findIndex((line) => !isBlank(line))
    let bottom = lines.length - 1
    while (bottom >= 0 && isBlank(lines[bottom])) bottom--
    if (top === -1 || bottom < top) return text

    const contentLines = lines.slice(top, bottom + 1)
    let left = Infinity
    let right = 0
    for (const line of contentLines) {
      if (isBlank(line)) continue
      left = Math.min(left, line.length - line.trimStart().length)
      right = Math.max(right, line.trimEnd().length)
    }
    if (!isFinite(left) || right <= left) return text

    return contentLines.map((line) => line.slice(left, right)).join('\n')
  }

  copyButton.addEventListener('click', () => {
    const td = effect.domElement.querySelector('td')
    if (!td) return
    // fixAsciiOverflow() may wrap the rows in a scaling <span>; read from that so the
    // wrapper markup doesn't leak into the copied text.
    const rows = td.querySelector('span') || td
    const rawText = rows.innerHTML.replace(/&nbsp;/g, ' ').split(/<br\s*\/?>/i).join('\n')
    const text = cropAsciiArt(rawText)
    const showFeedback = (label) => {
      copyButton.textContent = label
      setTimeout(() => { copyButton.textContent = 'Copy' }, 1500)
    }
    navigator.clipboard.writeText(text).then(
      () => showFeedback('Copied!'),
      () => showFeedback('Copy failed')
    )
  })

  let mixer = null
  let currentModel = null
  let currentModelConfig = null
  let baseScale = 1 // targetSize / maxDim for the currently loaded model, before the scale-slider multiplier
  const clock = new THREE.Clock()

  const loader = new GLTFLoader()

  // Re-applies the model's scale (base auto-fit size times the scale-slider multiplier) and
  // re-centers/re-grounds it, without needing to reload the glTF. Camera target changes are
  // picked up smoothly by the lerp in animate() rather than snapping instantly.
  function applyScale(multiplier) {
    const model = currentModel
    const modelConfig = currentModelConfig
    if (!model || !modelConfig) return

    model.position.set(0, 0, 0)
    model.rotation.set(0, 0, 0)
    model.scale.setScalar(baseScale * multiplier)

    const scaledBox = new THREE.Box3().setFromObject(model)
    const center = new THREE.Vector3()
    scaledBox.getCenter(center)
    model.position.x -= center.x
    model.position.z -= center.z

    if (modelConfig.ground) {
      model.position.y -= scaledBox.min.y
      const height = scaledBox.max.y - scaledBox.min.y
      currentTarget.set(0, height * 0.4, 0)
    } else {
      model.position.y -= center.y
      currentTarget.set(0, 0, 0)
    }
  }

  // Pop-in transition state for whichever model just loaded — scales up from tiny and fades
  // in from transparent over TRANSITION_DURATION, instead of appearing abruptly on tab switch.
  const TRANSITION_DURATION = 0.2
  let transitionElapsed = 0
  let transitionScale = new THREE.Vector3()
  let transitionMaterials = []

  function startModelTransition(model) {
    transitionElapsed = 0
    transitionScale.copy(model.scale)
    model.scale.setScalar(0.001)

    transitionMaterials = []
    model.traverse((node) => {
      if (!node.material) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        material.transparent = true
        material.opacity = 0
        transitionMaterials.push(material)
      }
    })
  }

  function updateModelTransition(delta) {
    if (transitionElapsed >= TRANSITION_DURATION) return
    // Loading a big model can stall the main thread for a while (parsing, then shader/texture
    // compilation on its first draw) before this ever gets a chance to run again. Clamp the
    // per-frame step so a single stalled frame can't skip straight to the end — the ease-in
    // still plays out over multiple frames once rendering catches up, however late that is.
    const clampedDelta = Math.min(delta, 0.05)
    transitionElapsed = Math.min(transitionElapsed + clampedDelta, TRANSITION_DURATION)
    const t = transitionElapsed / TRANSITION_DURATION
    const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic

    currentModel.scale.copy(transitionScale).multiplyScalar(eased)
    for (const material of transitionMaterials) material.opacity = eased
  }

  // A big model can take a few seconds to fetch and parse. Rather than leaving the old model
  // frozen on screen with no feedback until the new one is ready, shrink/fade it out the
  // instant a tab is clicked so the click feels like it did something right away.
  const OUTGOING_DURATION = 0.1
  let outgoingModel = null
  let outgoingElapsed = 0
  let outgoingScale = new THREE.Vector3()
  let outgoingMaterials = []

  function startOutgoingFade(model) {
    outgoingModel = model
    outgoingElapsed = 0
    outgoingScale.copy(model.scale)

    outgoingMaterials = []
    model.traverse((node) => {
      if (!node.material) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        material.transparent = true
        outgoingMaterials.push(material)
      }
    })
  }

  function updateOutgoingFade(delta) {
    if (!outgoingModel) return
    outgoingElapsed = Math.min(outgoingElapsed + Math.min(delta, 0.05), OUTGOING_DURATION)
    const remaining = 1 - outgoingElapsed / OUTGOING_DURATION

    outgoingModel.scale.copy(outgoingScale).multiplyScalar(remaining)
    for (const material of outgoingMaterials) material.opacity = remaining

    if (outgoingElapsed >= OUTGOING_DURATION) {
      scene.remove(outgoingModel)
      outgoingModel = null
      outgoingMaterials = []
    }
  }

  // Caches parsed glTFs by model id, so switching back to an already-visited tab (or one
  // that finished preloading in the background) reuses the parsed scene graph instead of
  // re-fetching and re-parsing the file from scratch.
  const modelCache = new Map()

  function activateModel(modelConfig, gltf) {
    const model = gltf.scene
    // A cached model may have been left mid-fade (scaled toward 0) the last time it was
    // swapped out. Reset to a clean unit scale before measuring it, otherwise a stale
    // near-zero scale collapses the bounding box and poisons the size math with Infinity/NaN.
    model.scale.set(1, 1, 1)
    scene.add(model)
    currentModel = model
    currentModelConfig = modelConfig

    // Normalize the imported model to a consistent base size, scaling by the largest
    // dimension since models vary between long/low quadrupeds and roughly spherical shapes.
    const targetSize = 1.6
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    baseScale = targetSize / maxDim

    scaleSlider.value = modelConfig.scale
    applyScale(modelConfig.scale)
    startModelTransition(model)
    // Parsing a large glTF can block the main thread for a while before this callback
    // fires. Flush the clock now so that block doesn't get counted as elapsed transition
    // time — otherwise the very next frame's delta absorbs the whole blocked duration and
    // the transition completes in a single oversized step instead of animating smoothly.
    clock.getDelta()

    const runClip = gltf.animations[0]
    if (runClip) {
      mixer = new THREE.AnimationMixer(model)
      mixer.clipAction(runClip).play()
    }
  }

  function loadModel(modelConfig) {
    const cached = modelCache.get(modelConfig.id)
    if (cached) {
      activateModel(modelConfig, cached)
      return
    }
    loader.load(modelConfig.path, (gltf) => {
      modelCache.set(modelConfig.id, gltf)
      activateModel(modelConfig, gltf)
    })
  }

  loadModel(MODELS[0])

  // Quietly fetch and parse the other models in the background (one at a time, so a huge
  // file like the daisy bouquet doesn't contend with an equally heavy one) so that whichever
  // tab gets clicked next is hopefully already cached and appears instantly instead of
  // stalling on the network/parse right when the user is waiting on it.
  function preloadRemainingModels() {
    const queue = MODELS.filter((m) => m.id !== MODELS[0].id)
    function next() {
      const modelConfig = queue.shift()
      if (!modelConfig || modelCache.has(modelConfig.id)) {
        if (queue.length) next()
        return
      }
      loader.load(modelConfig.path, (gltf) => {
        modelCache.set(modelConfig.id, gltf)
        next()
      })
    }
    next()
  }
  const scheduleIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500))
  scheduleIdle(preloadRemainingModels)

  scaleSlider.addEventListener('input', (e) => {
    applyScale(parseFloat(e.target.value))
  })
  wireSliderValueDisplay(scaleSlider, scaleValue)

  const modelTabs = document.querySelectorAll('.model-tab')

  // Fades out whatever's currently shown so a new model can be swapped in.
  function swapOutCurrentModel() {
    if (!currentModel) return
    if (outgoingModel) scene.remove(outgoingModel) // still fading from a previous quick switch
    startOutgoingFade(currentModel)
    currentModel = null
    currentModelConfig = null
    mixer = null
  }

  modelTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const modelConfig = MODELS.find((m) => m.id === tab.dataset.model)
      if (!modelConfig || tab.classList.contains('active')) return
      modelTabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')

      swapOutCurrentModel()
      loadModel(modelConfig)
    })
  })

  let frameCount = 0
  function animate() {
    requestAnimationFrame(animate)
    frameCount++
    const delta = clock.getDelta()
    if (mixer) mixer.update(delta)
    if (currentModel) updateModelTransition(delta)
    updateOutgoingFade(delta)
    // Smoothly glide the orbit target to wherever it needs to be (new model height, scale
    // change) instead of snapping the camera pivot instantly.
    controls.target.lerp(currentTarget, 1 - Math.pow(0.00002, delta))
    controls.update()
    effect.render(scene, camera)
    fixAsciiOverflow()
  }
  animate()

  window._debug = { getFrameCount: () => frameCount, getEffect: () => effect, getControls: () => controls, camera, scene, forceRender: () => effect.render(scene, camera) }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    effect.setSize(window.innerWidth, window.innerHeight)
  })
}
