// src/components/LudoScene.tsx

"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { Box, Center, Spinner, Text, VStack } from "@chakra-ui/react";
import * as THREE from "three";
import * as CANNON from "cannon";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function LudoScene({ gameMode }: { gameMode: string }) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const piecesRef = useRef<{ mesh: THREE.Object3D; body: CANNON.Body }[]>([]);

    const animate = useCallback(
        (
            renderer: THREE.WebGLRenderer,
            scene: THREE.Scene,
            camera: THREE.PerspectiveCamera,
            world: CANNON.World
        ) => {
            // Update physics
            const fixedTimeStep = 1 / 60;
            world.step(fixedTimeStep);

            // Sync physics bodies with visual meshes
            piecesRef.current.forEach((piece) => {
                piece.mesh.position.copy(piece.body.position as any);
                piece.mesh.quaternion.copy(piece.body.quaternion as any);
            });

            // Render scene
            renderer.render(scene, camera);
            requestAnimationFrame(() => animate(renderer, scene, camera, world));
        },
        []
    );

    useEffect(() => {
        console.log("Game Mode Initialized:", gameMode);
        if (!mountRef.current) return;

        // === Basic Scene Setup ===
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);
        const camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(0, 4, 3.5);
        camera.lookAt(0, 0, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Physics World
        const world = new CANNON.World();
        world.gravity.set(0, -9.82, 0);

        // === Board, Ground, and Dice Area ===
        const boardSize = 2; // 2m
        const cellSize = 0.1; // 10cm
        const boardYPosition = 0.01;

        // 1. Ground
        const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        world.addBody(groundBody);
        const groundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        // 2. Board Surface
        const boardMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(boardSize, boardSize),
            new THREE.MeshStandardMaterial({ color: 0x228B22 }) // Base green color
        );
        boardMesh.rotation.x = -Math.PI / 2;
        boardMesh.position.y = boardYPosition;
        boardMesh.receiveShadow = true;
        scene.add(boardMesh);

        // 3. Edges
        const edgeHeight = 0.05;
        const edgeThickness = 0.02;
        const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const edges = new THREE.Group();
        const topEdge = new THREE.Mesh(new THREE.BoxGeometry(boardSize + edgeThickness * 2, edgeHeight, edgeThickness), edgeMaterial);
        topEdge.position.z = -boardSize / 2 - edgeThickness / 2;
        const bottomEdge = new THREE.Mesh(new THREE.BoxGeometry(boardSize + edgeThickness * 2, edgeHeight, edgeThickness), edgeMaterial);
        bottomEdge.position.z = boardSize / 2 + edgeThickness / 2;
        const leftEdge = new THREE.Mesh(new THREE.BoxGeometry(edgeThickness, edgeHeight, boardSize), edgeMaterial);
        leftEdge.position.x = -boardSize / 2 - edgeThickness / 2;
        const rightEdge = new THREE.Mesh(new THREE.BoxGeometry(edgeThickness, edgeHeight, boardSize), edgeMaterial);
        rightEdge.position.x = boardSize / 2 + edgeThickness / 2;
        edges.add(topEdge, bottomEdge, leftEdge, rightEdge);
        edges.position.y = boardYPosition + edgeHeight / 2;
        scene.add(edges);

        // 4. Grid
        const gridHelper = new THREE.GridHelper(boardSize, 20, 0x000000, 0x000000);
        gridHelper.position.y = boardYPosition + 0.001;
        scene.add(gridHelper);

        // 5. Dice Area (Center 4x4)
        const diceAreaSize = 4 * cellSize;
        const diceAreaGeometry = new THREE.PlaneGeometry(diceAreaSize, diceAreaSize);
        const diceAreaMaterial = new THREE.MeshStandardMaterial({ color: 0xdaa520 }); // Gold color
        const diceAreaMesh = new THREE.Mesh(diceAreaGeometry, diceAreaMaterial);
        diceAreaMesh.rotation.x = -Math.PI / 2;
        diceAreaMesh.position.y = boardYPosition + 0.002; // Slightly above board
        scene.add(diceAreaMesh);

        // === Player Pieces Loading ===
        const loadingManager = new THREE.LoadingManager(() => {
            setIsLoading(false);
        });
        const gltfLoader = new GLTFLoader(loadingManager);

        const gridToWorld = (gridX: number, gridZ: number) => {
            const x = gridX * cellSize - boardSize / 2 + cellSize / 2;
            const z = gridZ * cellSize - boardSize / 2 + cellSize / 2;
            return new THREE.Vector3(x, boardYPosition + 0.02, z);
        };

        const players = [
            { model: "/models/player1.glb", home: [{ x: 2, z: 2 }, { x: 3, z: 2 }, { x: 2, z: 3 }, { x: 3, z: 3 }] },
            { model: "/models/player2.glb", home: [{ x: 16, z: 2 }, { x: 17, z: 2 }, { x: 16, z: 3 }, { x: 17, z: 3 }] },
            { model: "/models/player3.glb", home: [{ x: 16, z: 16 }, { x: 17, z: 16 }, { x: 16, z: 17 }, { x: 17, z: 17 }] },
            { model: "/models/player4.glb", home: [{ x: 2, z: 16 }, { x: 3, z: 16 }, { x: 2, z: 17 }, { x: 3, z: 17 }] },
        ];

        players.forEach(player => {
            gltfLoader.load(player.model, (gltf) => {
                player.home.forEach(startPos => {
                    const pieceMesh = gltf.scene.clone();
                    pieceMesh.scale.set(0.05, 0.05, 0.05); // Adjust scale as needed
                    pieceMesh.traverse(child => { if ((child as THREE.Mesh).isMesh) child.castShadow = true; });

                    const position = gridToWorld(startPos.x, startPos.z);
                    pieceMesh.position.copy(position);
                    scene.add(pieceMesh);

                    const pieceBody = new CANNON.Body({
                        mass: 1,
                        position: new CANNON.Vec3(position.x, position.y, position.z),
                        shape: new CANNON.Sphere(cellSize * 0.4), // Physics shape
                    });
                    world.addBody(pieceBody);

                    piecesRef.current.push({ mesh: pieceMesh, body: pieceBody });
                });
            });
        });

        // === Start Animation ===
        animate(renderer, scene, camera, world);

        // Handle window resize
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", handleResize);

        // Cleanup on unmount
        return () => {
            window.removeEventListener("resize", handleResize);
            if (mountRef.current) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, [animate, gameMode]);

    return (
        <Box
            ref={mountRef}
            sx={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                position: "relative",
            }}
        >
            {isLoading && (
                <Center position="absolute" top="0" left="0" width="100%" height="100%" zIndex="20" bg="rgba(0,0,0,0.7)">
                    <VStack>
                        <Spinner size="xl" color="white" />
                        <Text color="white" mt={4}>Loading Game Assets...</Text>
                    </VStack>
                </Center>
            )}
        </Box>
    );
}
