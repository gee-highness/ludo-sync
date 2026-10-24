"use client";

import { Box, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { IslandStyle } from "@/lib/client/islands";
import { buildBuilding, type BuiltBuilding } from "../board/buildings3d";

/** A turntable with the island's building at each of its four stages, built by the same code the game board uses. */
export default function IslandPreview3D({ style, height = 230 }: { style: IslandStyle; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(style);
  latest.current = style;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(0, 3.1, 5.4);
    camera.lookAt(0, 0.7, 0);
    scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x1b1b30, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const stage = new THREE.Group();
    scene.add(stage);

    let built: BuiltBuilding[] = [];
    let key = "";
    const clear = () => { built.forEach(b => b.dispose()); built = []; stage.clear(); };
    const build = () => {
      const s = latest.current;
      const k = JSON.stringify(s);
      if (k === key) return;
      key = k;
      clear();
      ([0, 1, 2, 3] as const).forEach((lv, i) => {
        const b = buildBuilding(s, lv);
        b.group.position.set(-1.6 + i * 1.07, 0, 0);
        stage.add(b.group);
        built.push(b);
      });
    };
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
      const t = now / 1000;
      stage.rotation.y = reduce ? 0.35 : Math.sin(t * 0.5) * 0.55;
      if (!reduce) built.forEach(b => b.update?.(t));
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clear();
      ground.geometry.dispose(); (ground.material as THREE.Material).dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, []);

  if (failed) return <Box h={`${height}px`} display="grid" placeItems="center"><Text fontSize="sm" color="gray.400">3D is not available on this device</Text></Box>;
  return <Box ref={host} h={`${height}px`} w="100%" role="img" aria-label="3D preview of the island's buildings, from an empty lot to a tower" />;
}
