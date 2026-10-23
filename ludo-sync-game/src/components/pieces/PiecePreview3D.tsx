"use client";

import { Box, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Seat } from "@/lib/ludo/board";
import type { ResolvedDesign } from "@/lib/client/pieces";
import { buildPiece3D, type Built3D } from "../board/pieces3d";

/** A turntable showing one piece in 3D, built by the same code the game board uses. */
export default function PiecePreview3D({ design, seat, height = 220 }: { design: ResolvedDesign; seat: Seat; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ design, seat });
  latest.current = { design, seat };
  const [failed, setFailed] = useState(false);
  const rebuild = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 3.4, 6.2);
    camera.lookAt(0, 1.1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const stage = new THREE.Group();
    scene.add(stage);

    let built: Built3D | null = null;
    let classic: THREE.Object3D | null = null;
    let key = "";
    let disposed = false;
    const loader = new GLTFLoader();

    const clear = () => {
      if (built) { built.dispose(); built = null; }
      if (classic) { classic.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) ((Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[]).forEach(x => x.dispose()); }); classic = null; }
      stage.clear();
    };
    const build = () => {
      const { design: d, seat: s } = latest.current;
      const k = JSON.stringify(d) + s;
      if (k === key) return;
      key = k;
      clear();
      if (d.shape === "classic") {
        loader.loadAsync(`/models/player${s + 1}.glb`).then(gltf => {
          if (disposed || key !== k) return;
          const tpl = (gltf.scene.children[0] ?? gltf.scene).clone(true);
          tpl.traverse(c => {
            const m = c as THREE.Mesh;
            if (!m.isMesh) return;
            ((Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]).forEach(x => {
              x.metalness = 0.05; x.roughness = 0.38; x.color.set(d.primary); x.emissive.set(d.glow ?? d.primary); x.emissiveIntensity = d.glow ? 0.15 + 0.6 * d.glowStrength : 0.18;
            });
          });
          const box = new THREE.Box3().setFromObject(tpl);
          const scale = 2.2 / Math.max(box.max.y - box.min.y, 0.001);
          tpl.scale.setScalar(scale);
          tpl.position.y = -box.min.y * scale;
          classic = tpl;
          stage.add(tpl);
        }).catch(() => undefined);
      } else {
        built = buildPiece3D(d);
        stage.add(built.group);
      }
    };
    rebuild.current = build;
    build();

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      build();
      const d = latest.current.design;
      const t = now / 1000;
      stage.rotation.y = reduce ? 0.5 : t * 0.7;
      const idle = d.idle;
      const grow = idle === "pulse" ? 1 + Math.sin(t * 3.4) * 0.09 : 1;
      stage.scale.setScalar(d.size * grow);
      stage.position.y = idle === "bounce" ? Math.abs(Math.sin(t * 2.4)) * 0.4 : 0;
      stage.rotation.z = idle === "wobble" ? Math.sin(t * 3) * 0.14 : 0;
      stage.rotation.x = 0;
      if (built?.facing) built.facing.rotation.y = 0;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      clear();
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  if (failed) return <Box h={`${height}px`} display="grid" placeItems="center"><Text fontSize="sm" color="gray.400">3D is not available on this device</Text></Box>;
  return <Box ref={host} h={`${height}px`} w="100%" role="img" aria-label="3D preview of the piece" />;
}
