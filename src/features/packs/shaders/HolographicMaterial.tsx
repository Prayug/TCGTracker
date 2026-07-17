import * as THREE from 'three';

/**
 * Advanced holographic foil shader. Renders a view-angle-dependent rainbow
 * sheen with procedural sparkle noise on top of either a texture (card artwork)
 * or a flat tint (card backs / pack foil). Attach to meshes via
 * `<primitive object={material} attach="material" />`.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uTint;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  // Hash function for procedural noise
  float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }

  // Smooth noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Rainbow color from hue
  vec3 rainbow(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }

  // Iridescent color based on view angle + surface normal
  vec3 iridescence(vec3 normal, vec3 viewDir, float time) {
    float fresnel = pow(1.0 - abs(dot(normalize(normal), normalize(viewDir))), 3.0);
    float hue = fresnel * 1.8 + time * 0.08;
    // Shift hue based on world position for spatial variation
    hue += dot(vWorldPos.xy, vec2(0.3, 0.2)) * 0.3;
    return rainbow(hue);
  }

  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float fresnel = pow(1.0 - facing, 2.5);

    // Diagonal interference bands with spatial variation
    float band = vUv.x * 2.4 + vUv.y * 1.8 + uTime * 0.2 + fresnel * 2.0;
    // Add subtle warp for more organic feel
    band += noise(vUv * 8.0 + uTime * 0.1) * 0.15;
    vec3 holo = rainbow(band);

    // Iridescent layer (view-angle dependent)
    vec3 irid = iridescence(vNormal, vViewDir, uTime);

    // Procedural sparkle noise — tiny bright dots that shimmer
    vec2 sparkleUv = vUv * 40.0 + uTime * 0.3;
    float sparkleNoise = noise(sparkleUv);
    sparkleNoise = pow(sparkleNoise, 8.0) * 3.0; // Sharpen into tiny sparkles
    // Only show sparkles at certain view angles
    float sparkleView = pow(fresnel, 1.5);
    vec3 sparkle = vec3(1.0) * sparkleNoise * sparkleView;

    // Micro-line pattern (like real holographic foil)
    float lines = sin(vUv.x * 120.0 + vUv.y * 80.0 + uTime * 0.5) * 0.5 + 0.5;
    lines = pow(lines, 12.0) * 0.3;

    vec4 texel = texture2D(uMap, vUv);
    vec3 base = mix(uTint, texel.rgb, uHasMap);
    float alpha = mix(1.0, texel.a, uHasMap);

    // Combine all layers
    vec3 color = base;
    color += holo * uIntensity * (0.25 + 0.75 * fresnel);
    color += irid * uIntensity * 0.4 * fresnel;
    color += sparkle * uIntensity * 0.5;
    color += lines * uIntensity * fresnel * 0.5;

    // Edge glow enhancement
    float edgeGlow = pow(fresnel, 4.0) * uIntensity * 0.3;
    color += uTint * edgeGlow;

    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

export interface HolographicMaterialOptions {
  map?: THREE.Texture | null;
  tint?: THREE.ColorRepresentation;
  intensity?: number;
}

export class HolographicMaterial extends THREE.ShaderMaterial {
  constructor({ map = null, tint = '#7c3aed', intensity = 0.35 }: HolographicMaterialOptions = {}) {
    super({
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.FrontSide,
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uTint: { value: new THREE.Color(tint) },
        uOpacity: { value: 1 },
      },
    });
  }

  setMap(map: THREE.Texture | null) {
    this.uniforms.uMap.value = map;
    this.uniforms.uHasMap.value = map ? 1 : 0;
  }

  setTime(time: number) {
    this.uniforms.uTime.value = time;
  }

  setOpacity(opacity: number) {
    this.uniforms.uOpacity.value = opacity;
  }
}
