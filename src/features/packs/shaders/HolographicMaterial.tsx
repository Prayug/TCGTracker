import * as THREE from 'three';

/**
 * Iridescent foil shader. Renders a view-angle-dependent rainbow sheen on top
 * of either a texture (card artwork) or a flat tint (card backs / pack foil).
 * Attach to meshes via `<primitive object={material} attach="material" />`.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
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

  vec3 rainbow(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float fresnel = pow(1.0 - facing, 2.0);

    // Diagonal interference bands that drift slowly and shift with view angle.
    float band = vUv.x * 2.2 + vUv.y * 1.6 + uTime * 0.18 + fresnel * 1.6;
    vec3 holo = rainbow(band);

    vec4 texel = texture2D(uMap, vUv);
    vec3 base = mix(uTint, texel.rgb, uHasMap);
    float alpha = mix(1.0, texel.a, uHasMap);

    vec3 color = base + holo * uIntensity * (0.3 + 0.7 * fresnel);
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
