import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { getTierAnim, TIER_THEMES } from './tierConfig';

const BG_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BG_FRAGMENT_SHADER = `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uTime;
  uniform vec3 uTierGlow;
  uniform float uPulseSpeed;
  uniform float uPulseIntensity;
  varying vec2 vUv;
  varying vec3 vPosition;

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 bg = mix(uBottom, uTop, vUv.y);

    float dist = length(vUv - vec2(0.5, 0.6));
    float glow = exp(-dist * 3.0) * uPulseIntensity * (0.7 + 0.3 * sin(uTime * uPulseSpeed));
    bg += uTierGlow * glow;

    vec2 swirlUv = vUv * 3.0;
    float swirl1 = smoothNoise(swirlUv + uTime * 0.15);
    float swirl2 = smoothNoise(swirlUv * 1.5 - uTime * 0.1);
    float swirlPattern = swirl1 * 0.6 + swirl2 * 0.4;

    float swirlAngle = atan(swirlUv.y - 1.5, swirlUv.x - 1.5);
    float swirlRadius = length(swirlUv - 1.5);
    float spiral = sin(swirlAngle * 3.0 + swirlRadius * 2.0 - uTime * 0.8) * 0.5 + 0.5;

    float energyMask = smoothstep(0.3, 0.7, spiral) * smoothstep(0.0, 1.5, swirlRadius);
    vec3 energyColor = uTierGlow * energyMask * uPulseIntensity * 0.4;
    bg += energyColor * swirlPattern;

    float vignette = 1.0 - smoothstep(0.4, 1.2, dist);
    bg *= 0.7 + vignette * 0.3;

    gl_FragColor = vec4(bg, 1.0);
  }
`;

export const EnvironmentScene: React.FC<{
  tier: string;
  glamourLevel: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ tier, glamourLevel, timeRef }) => {
  const theme = TIER_THEMES[tier] || TIER_THEMES.starter;
  const anim = getTierAnim(tier);
  const isHighGlamour = glamourLevel === 'legendary' || glamourLevel === 'god';

  const bgMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(theme.bgTop) },
        uBottom: { value: new THREE.Color(theme.bgBottom) },
        uTime: { value: 0 },
        uTierGlow: { value: new THREE.Color(theme.particleColors[0] || '#ffffff') },
        uPulseSpeed: { value: anim.bgPulseSpeed },
        uPulseIntensity: { value: anim.bgPulseIntensity },
      },
      vertexShader: BG_VERTEX_SHADER,
      fragmentShader: BG_FRAGMENT_SHADER,
    });
  }, [theme.bgTop, theme.bgBottom, theme.particleColors, anim.bgPulseSpeed, anim.bgPulseIntensity]);

  useEffect(() => () => bgMaterial.dispose(), [bgMaterial]);

  useFrame(() => {
    bgMaterial.uniforms.uTime.value = timeRef.current;
  });

  return (
    <>
      <mesh material={bgMaterial}>
        <sphereGeometry args={[30, 32, 32]} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color={theme.bgBottom}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.4}
        />
      </mesh>

      {isHighGlamour && (
        <Sparkles
          count={theme.ambientParticles}
          size={1.5}
          scale={[12, 8, 12]}
          speed={0.3}
          color={theme.particleColors[0]}
          opacity={0.3}
        />
      )}
    </>
  );
};
