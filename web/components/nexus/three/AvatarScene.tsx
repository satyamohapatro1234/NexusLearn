"use client";
/* eslint-disable @typescript-eslint/ban-ts-comment */

import { Suspense, useRef, useEffect } from "react";
// @ts-ignore - R3F types require special tsconfig not compatible with Next.js isolatedModules
import { Canvas, useFrame } from "@react-three/fiber";
// @ts-ignore
import { OrbitControls, useGLTF, useAnimations, Environment } from "@react-three/drei";
import * as THREE from "three";

function AvatarModel({ url, isSpeaking }: { url: string; isSpeaking: boolean }) {
  const group = useRef<THREE.Group>(null);
  // @ts-ignore
  const { scene, animations } = useGLTF(url);
  // @ts-ignore
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    if (!scene) return;
    const box = new THREE.Box3().setFromObject(scene as THREE.Object3D);
    const center = box.getCenter(new THREE.Vector3());
    (scene as any).position.set(-center.x, -(box.min.y), -center.z);
  }, [scene]);

  useEffect(() => {
    if (!names.length) return;
    Object.values(actions).forEach((a: any) => a?.fadeOut(0.3));
    const target = isSpeaking
      ? (names.find((n: string) => /talk|speak/i.test(n)) || names.find((n: string) => /idle/i.test(n)) || names[0])
      : (names.find((n: string) => /idle|stand|breath/i.test(n)) || names[0]);
    if (target && (actions as any)[target]) {
      (actions as any)[target].reset().fadeIn(0.3).play();
    }
  }, [isSpeaking, actions, names]);

  useFrame(() => {
    if (group.current && !(names as string[]).length) {
      group.current.rotation.y = Math.sin(Date.now() * 0.0005) * 0.05;
    }
  });

  // @ts-ignore
  return <primitive ref={group} object={scene} />;
}

export default function AvatarScene({ avatarFile, isSpeaking }: { avatarFile: string; isSpeaking: boolean }) {
  return (
    // @ts-ignore
    <Canvas camera={{ position: [0, 1.2, 2.5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
      {/* @ts-ignore */}
      <ambientLight intensity={0.6} />
      {/* @ts-ignore */}
      <directionalLight position={[2, 4, 2]} intensity={1.2} />
      {/* @ts-ignore */}
      <directionalLight position={[-2, 2, -2]} intensity={0.4} color="#6366f1" />
      {/* @ts-ignore */}
      <pointLight position={[0, 2, 2]} intensity={0.5} color="#818cf8" />
      <Suspense fallback={null}>
        <AvatarModel url={avatarFile} isSpeaking={isSpeaking} />
        <Environment preset="studio" />
      </Suspense>
      <OrbitControls enablePan={false} enableZoom={false}
        minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 1.8}
        autoRotate={!isSpeaking} autoRotateSpeed={0.4} />
    {/* @ts-ignore */}
    </Canvas>
  );
}
