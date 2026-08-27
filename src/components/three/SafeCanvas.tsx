import { Canvas, type CanvasProps } from '@react-three/fiber';

/** Canvas wrapper that handles WebGL context loss without throwing. */
export function SafeCanvas({ onCreated, ...props }: CanvasProps) {
  return (
    <Canvas
      {...props}
      onCreated={(state) => {
        state.gl.domElement.addEventListener(
          'webglcontextlost',
          (event) => {
            event.preventDefault();
          },
          false
        );
        onCreated?.(state);
      }}
    />
  );
}
