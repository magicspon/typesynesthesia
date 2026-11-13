import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type JSX } from 'react'
import { BackSide, ShaderMaterial, Vector3, type Mesh } from 'three'
import type { Look } from './look.ts'

/** Where the low sun hangs, as a unit direction. */
export const SUN_DIRECTION: Vector3 = new Vector3(-0.6, 0.18, -0.78).normalize()

/**
 * A dusk dome: deep blue overhead, a warm band at the horizon, and a glow
 * round the low sun. It follows the camera, so it is always at infinity.
 */
export function Sky({ look }: { look: Look }): JSX.Element {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          zenith: { value: look.zenith },
          horizon: { value: look.horizon },
          sunColour: { value: look.sun },
          sun: { value: SUN_DIRECTION },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith;
          uniform vec3 horizon;
          uniform vec3 sunColour;
          uniform vec3 sun;
          varying vec3 vDir;
          void main() {
            float up = clamp(vDir.y, 0.0, 1.0);
            vec3 sky = mix(horizon, zenith, pow(up, 0.45));
            float glow = max(dot(normalize(vDir), sun), 0.0);
            sky += sunColour * (pow(glow, 8.0) * 0.5 + pow(glow, 400.0) * 3.0);
            gl_FragColor = vec4(sky, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [look],
  )
  const ref = useRef<Mesh>(null)
  useFrame(({ camera }) => ref.current?.position.copy(camera.position))
  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  )
}
