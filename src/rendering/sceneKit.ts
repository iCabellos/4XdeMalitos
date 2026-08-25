import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { PALETTE } from './palette';

export interface SceneKit {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  /** Call from a render loop; returns false once disposed. */
  render: () => void;
  dispose: () => void;
  /** Screen point -> normalised device coordinates for raycasting. */
  toNdc: (clientX: number, clientY: number, out: THREE.Vector2) => THREE.Vector2;
}

export interface SceneKitOptions {
  container: HTMLElement;
  /** Distance limits for zoom, in world units. */
  minDistance: number;
  maxDistance: number;
  /** How far the camera may pan from the origin. */
  panLimit: number;
  initialDistance: number;
}

/**
 * Boots a Three.js scene with top-down strategy framing and controls that work
 * with both mouse and touch: one finger pans, two fingers pinch-zoom and orbit.
 * No behaviour depends on hover, so nothing is unreachable on a phone.
 */
export function createSceneKit(options: SceneKitOptions): SceneKit {
  const { container } = options;

  const renderer = new THREE.WebGLRenderer({
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);
  scene.fog = new THREE.Fog(PALETTE.background, options.maxDistance * 0.9, options.maxDistance * 2.2);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    500,
  );
  camera.position.set(0, options.initialDistance * 0.82, options.initialDistance * 0.62);
  camera.lookAt(0, 0, 0);

  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.minDistance = options.minDistance;
  controls.maxDistance = options.maxDistance;
  controls.maxPolarAngle = Math.PI * 0.45;
  controls.minPolarAngle = Math.PI * 0.08;
  // Touch mapping: dragging with one finger should pan the map, not orbit it.
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  // Contemporary-military lighting: cold key, warm bounce, no drama.
  const hemisphere = new THREE.HemisphereLight(0xbcd4ef, 0x2b2f26, 1.05);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-18, 26, 12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffc98a, 0.35);
  fill.position.set(14, 10, -16);
  scene.add(fill);

  const panBound = options.panLimit;
  const clampTarget = () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -panBound, panBound);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -panBound, panBound);
    controls.target.y = 0;
  };

  const resize = () => {
    const width = container.clientWidth;
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener('orientationchange', resize);

  let disposed = false;
  const render = () => {
    if (disposed) return;
    controls.update();
    clampTarget();
    renderer.render(scene, camera);
  };

  const toNdc = (clientX: number, clientY: number, out: THREE.Vector2) => {
    const rect = renderer.domElement.getBoundingClientRect();
    out.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    out.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return out;
  };

  const dispose = () => {
    disposed = true;
    observer.disconnect();
    window.removeEventListener('orientationchange', resize);
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return { renderer, scene, camera, controls, render, dispose, toNdc };
}

/**
 * Distinguishes a tap from a drag. Touch devices always move a few pixels, so a
 * small threshold is what keeps selection from firing during a pan.
 */
export function createTapDetector(
  element: HTMLElement,
  onTap: (clientX: number, clientY: number) => void,
  threshold = 8,
): () => void {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;

  const down = (event: PointerEvent) => {
    if (!event.isPrimary) {
      tracking = false;
      return;
    }
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
    startTime = performance.now();
  };

  const up = (event: PointerEvent) => {
    if (!tracking || !event.isPrimary) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > threshold) return;
    if (performance.now() - startTime > 700) return;
    onTap(event.clientX, event.clientY);
  };

  const cancel = () => {
    tracking = false;
  };

  element.addEventListener('pointerdown', down);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('pointerleave', cancel);

  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('pointerleave', cancel);
  };
}
