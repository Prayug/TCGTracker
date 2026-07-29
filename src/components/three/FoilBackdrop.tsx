import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function FoilParticles({ count = 40 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, [count]);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.04;
    points.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.05;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        color="#2dd4bf"
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export function FoilBackdrop({ className }: { className?: string }) {
  return (
    <div className={className ?? 'pointer-events-none absolute inset-0 -z-10 opacity-70'}>
      <Canvas
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, 4], fov: 50 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
      >
        <FoilParticles />
      </Canvas>
    </div>
  );
}
