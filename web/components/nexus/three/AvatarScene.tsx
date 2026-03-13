"use client";
import { useRef, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ── Animation file catalogue ────────────────────────────────────────────────
const IDLE_ANIM = "/avatars/animations/M_Standing_Expressions_001.glb";

// All 10 talking variations indexed 0-9
const ALL_TALK_ANIMS = Array.from({ length: 10 }, (_, i) =>
  `/avatars/animations/M_Talking_Variations_${String(i + 1).padStart(3, "0")}.glb`
);

// ── Keyword → animation bucket mapping ─────────────────────────────────────
//  0 = calm/default        (indices 0, 8, 9)
//  1 = explaining/teaching (indices 1, 2)
//  2 = excited/affirming   (indices 3, 4, 5)
//  3 = questioning/curious (indices 6, 7)

const BUCKETS: Record<string, number[]> = {
  calm:       [0, 8, 9],
  explaining: [1, 2],
  excited:    [3, 4, 5],
  questioning:[6, 7],
};

function pickAnimIndex(message: string): number {
  const m = message.toLowerCase();
  let bucket: number[];

  if (/wow|amazing|great|excellent|fantastic|awesome|exciting|yes!|absolutely|exactly|perfect|wonderful|congrats|correct|well done/.test(m)) {
    bucket = BUCKETS.excited;
  } else if (/\?|what |why |how |when |where |which |do you|did you|can you|right\?|understand|confused|wonder|unsure|think about/.test(m)) {
    bucket = BUCKETS.questioning;
  } else if (/because|therefore|this means|involves|works by|for example|instance|specifically|basically|essentially|in other words|note that|remember that|key point|important/.test(m)) {
    bucket = BUCKETS.explaining;
  } else {
    bucket = BUCKETS.calm;
  }

  return bucket[Math.floor(Math.random() * bucket.length)];
}

// ── Utility: load a single AnimationClip from a GLB URL ────────────────────
function loadClip(url: string): Promise<THREE.AnimationClip> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (g) => resolve(g.animations[0]), undefined, reject);
  });
}

// ── Component ───────────────────────────────────────────────────────────────
export default function AvatarScene({
  avatarFile,
  isSpeaking,
  message = "",
}: {
  avatarFile: string;
  isSpeaking: boolean;
  message?: string;
}) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const speakRef   = useRef(isSpeaking);
  const messageRef = useRef(message);

  useEffect(() => { speakRef.current   = isSpeaking; }, [isSpeaking]);
  useEffect(() => { messageRef.current = message;    }, [message]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────
    const w = mount.clientWidth  || 300;
    const h = mount.clientHeight || 400;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // ── Scene / Camera / Lights ───────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 1.6, 2.8);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(2, 4, 2);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6366f1, 0.5);
    fill.position.set(-2, 2, -2);
    scene.add(fill);
    const pointLight = new THREE.PointLight(0x818cf8, 0.6);
    pointLight.position.set(0, 2, 2);
    scene.add(pointLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan  = false;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI / 4;
    controls.maxPolarAngle = Math.PI / 1.8;

    // ── Animation state ───────────────────────────────────────────────
    let mixer:       THREE.AnimationMixer | null = null;
    let idleAction:  THREE.AnimationAction | null = null;
    // Store all 10 pre-loaded talk actions (index matches ALL_TALK_ANIMS)
    const talkActions: (THREE.AnimationAction | null)[] = Array(10).fill(null);
    let activeTalkAction: THREE.AnimationAction | null = null;
    let animId:  number;
    let wasSpeak = false;
    const clock  = new THREE.Clock();
    let elapsed  = 0;
    let avatarMesh: THREE.Object3D | null = null;

    // ── Load avatar model ─────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.load(avatarFile, async (gltf) => {
      const model = gltf.scene;

      // Sit on floor, center horizontally
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);

      // Frame camera on head/torso
      const focusY = size.y * 0.62;
      camera.position.set(0, focusY + size.y * 0.22, size.y * 1.1);
      controls.target.set(0, focusY, 0);
      controls.update();

      scene.add(model);
      avatarMesh = model;
      mixer = new THREE.AnimationMixer(model);

      // Load idle animation first so the avatar isn't stuck in T-pose
      try {
        const idleClip = await loadClip(IDLE_ANIM);
        idleAction = mixer.clipAction(idleClip);
        idleAction.play();
      } catch {
        // fallback: use embedded clip if any
        if (gltf.animations.length) {
          idleAction = mixer.clipAction(gltf.animations[0]);
          idleAction.play();
        }
      }

      // Pre-load all 10 talking animations in the background
      ALL_TALK_ANIMS.forEach((url, idx) => {
        loadClip(url)
          .then((clip) => {
            if (!mixer) return;
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            talkActions[idx] = action;
          })
          .catch(() => { /* silently skip failed clips */ });
      });
    });

    // ── Render / animation loop ────────────────────────────────────────
    const animate = () => {
      animId  = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      elapsed    += delta;

      const speaking = speakRef.current;

      // ── Detect speaking state change ───────────────────────────────
      if (mixer && speaking !== wasSpeak) {
        wasSpeak = speaking;

        if (speaking) {
          // Pick animation based on current message keywords
          const idx    = pickAnimIndex(messageRef.current);
          const chosen = talkActions[idx] ?? talkActions.find(Boolean) ?? null;

          if (chosen) {
            idleAction?.fadeOut(0.35);
            activeTalkAction = chosen;
            activeTalkAction.reset().fadeIn(0.35).play();
          }
        } else {
          // Return to idle
          activeTalkAction?.fadeOut(0.4);
          activeTalkAction = null;
          if (idleAction) {
            idleAction.reset().fadeIn(0.4).play();
          }
        }
      }

      mixer?.update(delta);

      // Subtle procedural sway on top of skeletal animation
      if (avatarMesh) {
        avatarMesh.rotation.y = speaking
          ? Math.sin(elapsed * 1.8) * 0.055
          : Math.sin(elapsed * 0.45) * 0.025;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Resize observer ────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [avatarFile]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
