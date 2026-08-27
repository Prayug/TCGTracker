import React from 'react';
import * as THREE from 'three';
import { SafeCanvas } from '../../../components/three/SafeCanvas';
import { SceneContents } from './packOpening/SceneContents';
import { GLAMOUR_CONFIG } from './packOpening/tierConfig';
import type { PackOpeningSceneProps } from './packOpening/types';

export type { PackOpeningSceneProps };

const PackOpeningScene: React.FC<PackOpeningSceneProps> = (props) => {
  const config = GLAMOUR_CONFIG[props.glamourLevel || 'normal'];
  return (
    <div className="h-[500px] w-full sm:h-[600px]" aria-label="Pack opening animation">
      <SafeCanvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        dpr={[1, 2]}
        camera={{ position: [0, 0.25, config.cameraZ], fov: 40 }}
        shadows
      >
        <SceneContents {...props} />
      </SafeCanvas>
    </div>
  );
};

export default PackOpeningScene;
