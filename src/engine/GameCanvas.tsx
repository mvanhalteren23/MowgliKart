/**
 * GameCanvas — the R3F `<Canvas>` hosting the HD-2D world. Mount only after
 * services are bound (mode ≠ 'boot'). Fills its parent.
 *
 * Reads: `useGame` (mode, combat, party/leader, flags/questLog, township,
 * clearedZones, merchantSurfaced, wind, drakeSightUntil, worldTime, fishing,
 * dialogue), `runtime.input`, `runtime.requests.fieldAction`.
 * Writes: `runtime.player`, `runtime.camera`, `runtime.perf`, the post pass's
 * fog/sky colours (biome atmosphere); store actions
 * `setContextAction`, `dispatchWorldEvent`, `reportHunt`, `tickWorld`.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { runtime } from '@/app/runtime';
import { Hd2dPipeline } from '@/engine/shaders';
import { BillboardSprite } from './BillboardSprite';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR } from './cameraRig';
import { EngineCore } from './engineCore';

function CombatStage({ engine }: { engine: EngineCore }) {
  const actors = useSyncExternalStore(engine.combat.subscribe, engine.combat.getSnapshot);
  return (
    <>
      {actors.map((e) => (
        <BillboardSprite key={e.id} entity={e} />
      ))}
    </>
  );
}

function World() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const [engine, setEngine] = useState<EngineCore | null>(null);
  const [pipeline, setPipeline] = useState<Hd2dPipeline | null>(null);

  useEffect(() => {
    const e = new EngineCore();
    scene.add(e.root);
    setEngine(e);
    return () => {
      scene.remove(e.root);
      e.dispose();
      setEngine(null);
    };
  }, [scene]);

  useEffect(() => {
    const p = new Hd2dPipeline(gl);
    setPipeline(p);
    return () => {
      p.dispose();
      setPipeline(null);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const camera = state.camera;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (engine) engine.update(delta, state.clock.elapsedTime, camera);
    if (!pipeline) {
      gl.render(scene, camera);
      return;
    }
    pipeline.setSize(state.size.width, state.size.height, gl.getPixelRatio());
    if (engine) {
      const u = pipeline.uniforms;
      const a = engine.atmosphere;
      u.uFogColor.value.set(a.fog[0], a.fog[1], a.fog[2]);
      u.uSkyTop.value.set(a.skyTop[0], a.skyTop[1], a.skyTop[2]);
      u.uSkyHorizon.value.set(a.skyHorizon[0], a.skyHorizon[1], a.skyHorizon[2]);
      engine.motes.setViewport(state.size.height * gl.getPixelRatio(), camera.fov);
    }
    pipeline.render(scene, camera, { focusDistance: engine?.focusDistance ?? 40, combatBlend: runtime.camera.combatBlend });
    const perf = runtime.perf;
    perf.drawCalls = pipeline.drawCalls;
    perf.triangles = pipeline.triangles;
    if (delta > 0) perf.fps = perf.fps <= 0 ? 1 / delta : perf.fps + (1 / delta - perf.fps) * 0.05;
  }, 1);

  return engine ? <CombatStage engine={engine} /> : null;
}

function pickDpr(): number {
  if (typeof window === 'undefined') return 1;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  return Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
}

export function GameCanvas() {
  const [dpr] = useState(pickDpr);
  return (
    <Canvas
      flat
      linear
      dpr={dpr}
      shadows={false}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: [0, 30, 40] }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
    >
      <World />
    </Canvas>
  );
}
