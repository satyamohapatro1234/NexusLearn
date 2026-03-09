"use client";

/**
 * AvatarPanel - 3D Teacher Avatar
 * Uses GLB files from OpenTutorAI (The Coach, The Mentor, The Scholar, The Innovator)
 * Three.js via @react-three/fiber + @react-three/drei
 * Animations: idle, talking, nodding (from GLB animation clips)
 */

import { Suspense, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations, Environment } from "@react-three/drei";
import * as THREE from "three";
import { ChevronDown } from "lucide-react";

const AVATARS = [
  { id: "coach",    label: "The Coach",    file: "/avatars/The Coach.glb",    emoji: "🎯" },
  { id: "mentor",   label: "The Mentor",   file: "/avatars/The Mentor.glb",   emoji: "🧑‍🏫" },
  { id: "scholar",  label: "The Scholar",  file: "/avatars/The Scholar.glb",  emoji: "🎓" },
  { id: "innovator",label: "The Innovator",file: "/avatars/The Innovator.glb",emoji: "💡" },
];

function AvatarModel({
  url,
  isSpeaking,
}: {
  url: string;
  isSpeaking: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions, names } = useAnimations(animations, group);
  const [currentAnim, setCurrentAnim] = useState<string | null>(null);

  // Auto-position avatar nicely
  useEffect(() => {
    if (scene) {
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.set(-center.x, -box.min.y, -center.z);
    }
  }, [scene]);

  // Switch animation based on speaking state
  useEffect(() => {
    if (!names.length) return;

    // Stop all
    Object.values(actions).forEach((a) => a?.fadeOut(0.3));

    // Pick animation
    let target: string | null = null;
    if (isSpeaking) {
      // Try to find any animation that looks like talking/standing
      target =
        names.find((n) => /talk|speak|idle|stand|breath/i.test(n)) ||
        names[0];
    } else {
      target =
        names.find((n) => /idle|stand|breath|wait/i.test(n)) ||
        names[0];
    }

    if (target && actions[target]) {
      actions[target]!.reset().fadeIn(0.3).play();
      setCurrentAnim(target);
    }
  }, [isSpeaking, actions, names]);

  // Gentle sway animation when no clips available
  useFrame((_, delta) => {
    if (group.current && names.length === 0) {
      group.current.rotation.y = Math.sin(Date.now() * 0.0005) * 0.05;
    }
    // Breathing effect
    if (group.current) {
      const breathe = Math.sin(Date.now() * 0.001) * 0.005;
      group.current.scale.setScalar(1 + breathe);
    }
  });

  return <primitive ref={group} object={scene} />;
}

interface AvatarPanelProps {
  isSpeaking: boolean;
  className?: string;
}

export default function AvatarPanel({ isSpeaking, className = "" }: AvatarPanelProps) {
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className={`relative flex flex-col bg-gradient-to-b from-slate-900 to-indigo-950 rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/20">
        <div className="flex items-center gap-2">
          <span className="text-lg">{selectedAvatar.emoji}</span>
          <span className="text-white text-sm font-semibold">{selectedAvatar.label}</span>
          {isSpeaking && (
            <span className="flex gap-0.5 items-end h-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 bg-indigo-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s`, height: `${8 + i * 4}px` }}
                />
              ))}
            </span>
          )}
        </div>

        {/* Avatar picker */}
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1 text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-all"
          >
            Change <ChevronDown className="w-3 h-3" />
          </button>
          {showPicker && (
            <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[150px]">
              {AVATARS.map((av) => (
                <button
                  key={av.id}
                  onClick={() => {
                    setSelectedAvatar(av);
                    setShowPicker(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    selectedAvatar.id === av.id
                      ? "bg-indigo-600 text-white"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span>{av.emoji}</span>
                  <span>{av.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 min-h-[280px]">
        <Canvas
          camera={{ position: [0, 1.2, 2.5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 4, 2]} intensity={1.2} castShadow />
          <directionalLight position={[-2, 2, -2]} intensity={0.4} color="#6366f1" />
          <pointLight position={[0, 2, 2]} intensity={0.5} color="#818cf8" />

          <Suspense fallback={null}>
            <AvatarModel url={selectedAvatar.file} isSpeaking={isSpeaking} />
            <Environment preset="studio" />
          </Suspense>

          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.8}
            autoRotate={!isSpeaking}
            autoRotateSpeed={0.4}
          />
        </Canvas>
      </div>

      {/* Speaking indicator */}
      <div
        className={`h-1 transition-all duration-300 ${
          isSpeaking
            ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"
            : "bg-slate-800"
        }`}
      />
    </div>
  );
}
