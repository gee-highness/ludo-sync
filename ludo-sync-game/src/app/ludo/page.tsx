"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
// import * as CANNON from "cannon-es"; // <--- Potentially remove if physics not used for tokens
import { Box, Spinner, Center, Text, useToast, Button, Slider, SliderTrack, SliderThumb, IconButton, Flex } from "@chakra-ui/react";
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { useSearchParams } from "next/navigation";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


import { Suspense } from 'react'; // Import Suspense



interface TokenState {
    gridPos: [number, number];
    pathIndex: number;
    isInBase: boolean;
    isInHomePath: boolean;
    isHome: boolean;
}

interface Player {
    id: string;
    tokens: TokenState[];
    color: number;
    startPosition: [number, number];
    homePath: [number, number][];
    basePositions: [number, number][];
    homePathMainPathEntryIndex: number;
}

type GamePhase = 'IDLE' | 'ROLL_DICE' | 'SELECT_TOKEN_TO_MOVE' | 'ANIMATING_MOVE' | 'GAME_OVER';

interface FocalLengthControlsProps {
    getFocalLength: () => number;
    onIncrease: () => void;
    onDecrease: () => void;
}

const FocalLengthControls: React.FC<FocalLengthControlsProps> = ({
    getFocalLength,
    onIncrease,
    onDecrease,
}) => {
    const [displayFocalLength, setDisplayFocalLength] = useState(getFocalLength());

    useEffect(() => {
        const interval = setInterval(() => {
            // Only update if the value has changed to avoid unnecessary re-renders
            const currentFocalLength = getFocalLength();
            if (currentFocalLength !== displayFocalLength) {
                setDisplayFocalLength(currentFocalLength);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [getFocalLength, displayFocalLength]); // Add displayFocalLength to dependencies

    return (
        <Box
            position="absolute"
            bottom="4"
            left="4"
            bg="rgba(0,0,0,0.6)"
            p={3}
            borderRadius="md"
            color="white"
            zIndex="10"
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={2}
        >
            <Text fontSize="sm">Focal Length: {displayFocalLength.toFixed(0)}</Text>
            <Button onClick={onDecrease} size="sm" colorScheme="teal" width="full">
                Zoom In (+)
            </Button>
            <Button onClick={onIncrease} size="sm" colorScheme="teal" width="full">
                Zoom Out (-)
            </Button>
        </Box>
    );
};



export default function LudoPageWrapper() { // Create a wrapper component
    return (
        <Suspense fallback={
            <Center
                position="absolute"
                top="0"
                left="0"
                width="100%"
                height="100%"
                bg="rgba(0,0,0,0.7)"
                zIndex="20"
                flexDirection="column"
            >
                <Spinner size="xl" color="white" mb={4} />
                <Text color="white" fontSize="xl">
                    Loading game...
                </Text>
            </Center>
        }>
            <LudoPageContent />
        </Suspense>
    );
}



function LudoPageContent() {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    // const worldRef = useRef<CANNON.World | null>(null); // <--- Potentially remove
    const animationFrameId = useRef<number | null>(null);

    const tokenMeshMapRef = useRef<Map<string, THREE.Object3D[]>>(new Map());

    const [isLoading, setIsLoading] = useState(true);
    const toast = useToast();
    const searchParams = useSearchParams();

    const [gamePhase, setGamePhase] = useState<GamePhase>('IDLE');
    const [currentPlayerId, setCurrentPlayerId] = useState<string>('player1');
    const [rolledDiceValue, setRolledDiceValue] = useState<number | null>(null);
    const [players, setPlayers] = useState<Record<string, Player>>({});
    const [playerOrder] = useState<string[]>(['player1', 'player3']);
    const [winner, setWinner] = useState<string | null>(null);
    const [rollsLeft, setRollsLeft] = useState<number>(1);

    const playersRef = useRef(players);
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const [cameraFocalLength, setCameraFocalLength] = useState<number>(40);
    const [cameraVerticalAngle, setCameraVerticalAngle] = useState<number>(45 * Math.PI / 180);
    const [cameraRotationY, setCameraRotationY] = useState<number>(0);

    const gameMode = searchParams.get('mode') as 'play-with-bot' | 'local-friends' | 'multiplayer' || null;

    const { humanPlayerId, botPlayerId } = useMemo(() => {
        let derivedHumanPlayerId: string | null = null;
        let derivedBotPlayerId: string | null = null;

        if (gameMode === 'play-with-bot') {
            derivedHumanPlayerId = 'player1';
            derivedBotPlayerId = 'player3';
        } else if (gameMode === 'local-friends') {
            derivedHumanPlayerId = 'player1';
            derivedBotPlayerId = null;
        } else if (gameMode === 'multiplayer') {
            derivedHumanPlayerId = 'player1';
            derivedBotPlayerId = 'player3';
        }
        return { humanPlayerId: derivedHumanPlayerId, botPlayerId: derivedBotPlayerId };
    }, [gameMode]);

    const hasInitializedGame = useRef(false);

    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());

    const rollDiceRef = useRef<(() => void) | null>(null);
    const endTurnRef = useRef<(() => void) | null>(null);
    const makeBotMoveRef = useRef<((diceValue: number, movableTokens: number[]) => void) | null>(null);
    const moveTokenRef = useRef<((playerId: string, tokenIndex: number, diceValue: number) => void) | null>(null);
    const handleTokenClickRef = useRef<((playerId: string, tokenIndex: number) => void) | null>(null);

    const gamePhaseRef = useRef<GamePhase>('IDLE');
    const currentPlayerIdRef = useRef<string>('player1');
    const rolledDiceValueRef = useRef<number | null>(null);
    const rollsLeftRef = useRef<number>(1);

    const indicatorGeometry = useMemo(() => new THREE.SphereGeometry(0.3, 16, 16), []);
    const indicatorMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), []);
    const indicatorMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());

    const gridToWorld = useCallback((row: number, col: number) => {
        const worldX = col - 7;
        const worldZ = row - 7;
        return new THREE.Vector3(worldX, 0.01, worldZ);
    }, []);

    const pathCoordinates: [number, number][] = useMemo(() => [
        [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6],
        [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
        [7, 0],
        [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
        [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
        [0, 7],
        [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
        [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13],
        [7, 14],
        [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
        [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
        [14, 7]
    ], []);

    const playerHomePathMainPathEntryIndices: Record<string, number> = useMemo(() => ({
        player1: 51,
        player2: 12,
        player3: 25,
        player4: 38,
    }), []);

    const safeSpots: Set<string> = useMemo(() => new Set([
        JSON.stringify([13, 6]),
        JSON.stringify([6, 1]),
        JSON.stringify([1, 8]),
        JSON.stringify([8, 13]),
    ]), []);

    const calculateNextPosition = useCallback((
        tokenState: TokenState,
        steps: number,
        playerId: string
    ): TokenState | null => {
        const player = playersRef.current[playerId]; // Use ref for players
        if (!player) {
            return null;
        }

        if (tokenState.isInBase) {
            if (steps === 6) {
                const newPathIndex = pathCoordinates.findIndex(p => p[0] === player.startPosition[0] && p[1] === player.startPosition[1]);
                return { gridPos: player.startPosition, pathIndex: newPathIndex, isInBase: false, isInHomePath: false, isHome: false };
            } else {
                return null;
            }
        } else if (tokenState.isInHomePath) {
            const currentHomePathIndex = player.homePath.findIndex(p => p[0] === tokenState.gridPos[0] && p[1] === tokenState.gridPos[1]);
            const targetHomePathIndex = currentHomePathIndex + steps;

            if (targetHomePathIndex < player.homePath.length) {
                return { gridPos: player.homePath[targetHomePathIndex], pathIndex: targetHomePathIndex, isInBase: false, isInHomePath: true, isHome: false };
            } else if (targetHomePathIndex === player.homePath.length) {
                return { gridPos: [-1, -1], pathIndex: -2, isInBase: false, isInHomePath: false, isHome: true };
            } else {
                return null;
            }
        } else {
            const currentMainPathIndex = tokenState.pathIndex;
            let targetMainPathIndex = currentMainPathIndex + steps;

            if (currentMainPathIndex <= player.homePathMainPathEntryIndex && targetMainPathIndex > player.homePathMainPathEntryIndex) {
                const stepsIntoHomePath = targetMainPathIndex - player.homePathMainPathEntryIndex - 1;
                if (stepsIntoHomePath < player.homePath.length) {
                    return { gridPos: player.homePath[stepsIntoHomePath], pathIndex: stepsIntoHomePath, isInBase: false, isInHomePath: true, isHome: false };
                } else if (stepsIntoHomePath === player.homePath.length) {
                    return { gridPos: [-1, -1], pathIndex: -2, isInBase: false, isInHomePath: false, isHome: true };
                } else {
                    return null;
                }
            } else {
                const newPathIndex = targetMainPathIndex % pathCoordinates.length;
                const newGridPos = pathCoordinates[newPathIndex];
                return { gridPos: newGridPos, pathIndex: newPathIndex, isInBase: false, isInHomePath: false, isHome: false };
            }
        }
    }, [pathCoordinates, safeSpots]); // Removed `players` from dependencies, using `playersRef.current`

    const getMovableTokens = useCallback((playerId: string, diceValue: number): number[] => {
        const movableTokenIndices: number[] = [];
        const player = playersRef.current[playerId]; // Use ref for players

        if (!player) {
            return [];
        }

        player.tokens.forEach((token, index) => {
            if (token.isHome) {
                return;
            }
            const potentialNextState = calculateNextPosition(token, diceValue, playerId);
            if (potentialNextState) {
                movableTokenIndices.push(index);
            }
        });
        return movableTokenIndices;
    }, [calculateNextPosition]); // Removed `players` from dependencies

    const checkWinCondition = useCallback(() => {
        const currentPlayers = playersRef.current; // Use ref for players
        for (const playerId of playerOrder) {
            const player = currentPlayers[playerId];
            if (!player) {
                continue;
            }
            const tokensInHome = player.tokens.filter(token => token.isHome).length;
            if (tokensInHome === 4) {
                setWinner(playerId);
                setGamePhase('GAME_OVER');
                toast({
                    title: "Game Over!",
                    description: `${playerId.replace('player', 'Player ')} wins the game!`,
                    status: "success",
                    duration: null,
                    isClosable: true,
                    position: "top",
                });
                break;
            }
        }
    }, [playerOrder, toast]); // Removed `players` from dependencies

    const endTurn = useCallback(() => {
        setRolledDiceValue(null);
        setRollsLeft(1);
        const currentIndex = playerOrder.indexOf(currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerOrder.length;
        const nextPlayer = playerOrder[nextIndex];

        setCurrentPlayerId(nextPlayer);
        setGamePhase('ROLL_DICE');

        if (nextPlayer === botPlayerId) {
            setTimeout(() => {
                rollDiceRef.current?.();
            }, 1500);
        }
    }, [currentPlayerId, playerOrder, botPlayerId]);

    const rollDice = useCallback(() => {
        if (gamePhaseRef.current !== 'ROLL_DICE' || winner) { // Use ref for gamePhase
            return;
        }

        const diceResult = Math.floor(Math.random() * 6) + 1;
        setRolledDiceValue(diceResult);
        toast({
            title: "Dice Rolled!",
            description: `You rolled a ${diceResult}!`,
            status: "success",
            duration: 2000,
            isClosable: true,
            position: "top-right",
        });

        const movableTokens = getMovableTokens(currentPlayerIdRef.current, diceResult); // Use ref for currentPlayerId

        if (diceResult === 6) {
            setRollsLeft(prev => prev + 1);
            if (movableTokens.length > 0) {
                setGamePhase('SELECT_TOKEN_TO_MOVE');
                if (currentPlayerIdRef.current === botPlayerId) { // Use ref
                    setTimeout(() => {
                        makeBotMoveRef.current?.(diceResult, movableTokens);
                    }, 1000);
                }
            } else {
                toast({
                    title: "Rolled a 6, but no moves!",
                    description: "You get another turn!",
                    status: "info",
                    duration: 2000,
                    isClosable: true,
                    position: "top-right",
                });
                setTimeout(() => rollDiceRef.current?.(), 1500);
            }
        } else {
            if (movableTokens.length > 0) {
                setGamePhase('SELECT_TOKEN_TO_MOVE');
                setRollsLeft(prev => prev - 1);
                if (currentPlayerIdRef.current === botPlayerId) { // Use ref
                    setTimeout(() => {
                        makeBotMoveRef.current?.(diceResult, movableTokens);
                    }, 1000);
                }
            } else {
                if (rollsLeftRef.current > 1) {
                    setRollsLeft(prev => prev - 1);
                    toast({
                        title: "No possible moves",
                        description: `You have ${rollsLeftRef.current - 1} rolls left.`,
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                    setTimeout(() => rollDiceRef.current?.(), 1500);
                } else {
                    toast({
                        title: "No possible moves",
                        description: "Your tokens cannot move. Turn passes.",
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                    setTimeout(() => endTurnRef.current?.(), 1500);
                }
            }
        }
    }, [botPlayerId, winner, toast, getMovableTokens]); // Removed gamePhase and currentPlayerId from dependencies, using refs

    const adjustTokensInCell = useCallback((row: number, col: number) => {
        const tokensInThisCell: { mesh: THREE.Object3D, playerId: string, tokenIndex: number }[] = [];
        const currentPlayersState = playersRef.current; // Use the ref here

        playerOrder.forEach(pId => {
            const player = currentPlayersState[pId];
            if (!player) return;

            player.tokens.forEach((tokenState, tIndex) => {
                if (tokenState.gridPos[0] === row && tokenState.gridPos[1] === col) {
                    const mesh = tokenMeshMapRef.current.get(pId)?.[tIndex];
                    if (mesh && mesh.visible) {
                        tokensInThisCell.push({ mesh, playerId: pId, tokenIndex: tIndex });
                    }
                }
            });
        });

        const numTokens = tokensInThisCell.length;
        const baseScale = 0.5; // Original scale for a single token

        if (numTokens > 0) { // Ensure there's at least one token
            const cellWorldCenter = gridToWorld(row, col);
            const offsetDistance = 0.2; // Distance for offsetting tokens

            // Calculate the dynamic scale factor
            // To ensure tokens don't become excessively large or small,
            // we'll cap the maximum scale and provide a floor.
            // A simple 1/numTokens might make them too small with many tokens.
            // Let's make it proportional but with a minimum visible size.
            // For example, if numTokens is 1, scaleFactor is 1.
            // If numTokens is 2, scaleFactor is 0.5.
            // If numTokens is 4, scaleFactor is 0.25.
            let scaleFactor = 1 / numTokens;

            // Optional: Clamp the scale factor to prevent tokens from becoming too small
            // For example, ensure it's not smaller than 0.2 of the base scale.
            scaleFactor = Math.max(scaleFactor, 0.2); // Prevents scale from going below 20% of baseScale

            // Define offsets based on the number of tokens
            let offsets: [number, number][] = [];
            if (numTokens === 1) {
                // No offset needed for single token
                offsets = [[0, 0]];
            } else if (numTokens === 2) {
                offsets = [[-offsetDistance, 0], [offsetDistance, 0]];
            } else if (numTokens === 3) {
                offsets = [
                    [0, offsetDistance * 0.8],
                    [-offsetDistance * 0.7, -offsetDistance * 0.4],
                    [offsetDistance * 0.7, -offsetDistance * 0.4]
                ];
            } else if (numTokens === 4) {
                offsets = [
                    [-offsetDistance * 0.7, offsetDistance * 0.7],
                    [offsetDistance * 0.7, offsetDistance * 0.7],
                    [-offsetDistance * 0.7, -offsetDistance * 0.7],
                    [offsetDistance * 0.7, -offsetDistance * 0.7]
                ];
            } else {
                // For more than 4 tokens (unlikely in Ludo, but for robustness)
                // You might need a more complex offset distribution.
                // For now, we'll just place them at the center but scaled down heavily.
                tokensInThisCell.forEach(({ mesh }) => {
                    mesh.scale.set(baseScale * scaleFactor, baseScale * scaleFactor, baseScale * scaleFactor);
                    const cellWorldCenterDefault = gridToWorld(row, col);
                    mesh.position.set(cellWorldCenterDefault.x, 0.01, cellWorldCenterDefault.z);
                });
                return;
            }

            tokensInThisCell.forEach(({ mesh }, i) => {
                const [offsetX, offsetZ] = offsets[i];
                mesh.position.set(cellWorldCenter.x + offsetX, 0.01, cellWorldCenter.z + offsetZ);
                // Apply the dynamically calculated scale
                mesh.scale.set(baseScale * scaleFactor, baseScale * scaleFactor, baseScale * scaleFactor);
            });
        }
    }, [gridToWorld, playerOrder]);

    const moveToken = useCallback((playerId: string, tokenIndex: number, diceValue: number) => {
        const player = playersRef.current[playerId]; // Use ref
        if (!player || tokenIndex < 0 || tokenIndex >= player.tokens.length) {
            return;
        }

        const currentTokenState = player.tokens[tokenIndex];
        const potentialNextState = calculateNextPosition(currentTokenState, diceValue, playerId);

        if (!potentialNextState) {
            return;
        }

        setGamePhase('ANIMATING_MOVE');

        let capturedTokenInfo: { playerId: string; tokenIndex: number; originalBasePos: [number, number]; } | null = null;
        const isTargetSafeSpot = safeSpots.has(JSON.stringify(potentialNextState.gridPos));

        if (!potentialNextState.isHome) {
            for (const opponentId of playerOrder) {
                const opponentPlayer = playersRef.current[opponentId]; // Use ref
                if (!opponentPlayer) continue;
                if (opponentId === playerId) continue;

                for (let oppIndex = 0; oppIndex < opponentPlayer.tokens.length; oppIndex++) {
                    const opponentToken = opponentPlayer.tokens[oppIndex];
                    if (!opponentToken.isInBase && !opponentToken.isHome &&
                        opponentToken.gridPos[0] === potentialNextState.gridPos[0] &&
                        opponentToken.gridPos[1] === potentialNextState.gridPos[1]) {

                        if (!isTargetSafeSpot) {
                            capturedTokenInfo = {
                                playerId: opponentId,
                                tokenIndex: oppIndex,
                                originalBasePos: opponentPlayer.basePositions[oppIndex],
                            };
                            break;
                        }
                    }
                }
                if (capturedTokenInfo) break;
            }
        }

        setPlayers(prevPlayers => {
            const newPlayers = { ...prevPlayers };
            newPlayers[playerId] = {
                ...newPlayers[playerId],
                tokens: newPlayers[playerId].tokens.map((token, idx) =>
                    idx === tokenIndex ? potentialNextState : token
                ),
            };

            if (capturedTokenInfo) {
                const { playerId: capturedPId, tokenIndex: capturedTIdx, originalBasePos } = capturedTokenInfo;
                newPlayers[capturedPId] = {
                    ...newPlayers[capturedPId],
                    tokens: newPlayers[capturedPId].tokens.map((token, idx) =>
                        idx === capturedTIdx ? {
                            gridPos: originalBasePos,
                            pathIndex: -1,
                            isInBase: true,
                            isInHomePath: false,
                            isHome: false,
                        } : token
                    ),
                };
            }
            return newPlayers;
        });

        const tokenMesh = tokenMeshMapRef.current.get(playerId)?.[tokenIndex];
        if (!tokenMesh) {
            return;
        }

        const animationDurationPerStep = 0.2;
        const pathSegment: [number, number][] = [];

        if (currentTokenState.isInBase) {
            pathSegment.push(player.startPosition);
        } else if (potentialNextState.isInHomePath) {
            const startIndex = currentTokenState.pathIndex;
            const entryIndex = player.homePathMainPathEntryIndex;

            if (startIndex <= entryIndex) {
                for (let i = startIndex + 1; i <= entryIndex; i++) {
                    pathSegment.push(pathCoordinates[i % pathCoordinates.length]);
                }
            } else {
                for (let i = startIndex + 1; i < pathCoordinates.length; i++) {
                    pathSegment.push(pathCoordinates[i]);
                }
                for (let i = 0; i <= entryIndex; i++) {
                    pathSegment.push(pathCoordinates[i]);
                }
            }
            const stepsIntoHomePath = (potentialNextState.pathIndex ?? 0) + 1;
            for (let i = 0; i < stepsIntoHomePath; i++) {
                pathSegment.push(player.homePath[i]);
            }
        } else if (potentialNextState.isHome) {
            const startIndex = currentTokenState.pathIndex;
            for (let i = startIndex + 1; i < player.homePath.length; i++) {
                pathSegment.push(player.homePath[i]);
            }
            pathSegment.push([-1, -1]);
        } else {
            const startIndex = currentTokenState.pathIndex;
            const endIndex = potentialNextState.pathIndex;

            if (startIndex < endIndex) {
                for (let i = startIndex + 1; i <= endIndex; i++) {
                    pathSegment.push(pathCoordinates[i]);
                }
            } else {
                for (let i = startIndex + 1; i < pathCoordinates.length; i++) {
                    pathSegment.push(pathCoordinates[i]);
                }
                for (let i = 0; i <= endIndex; i++) {
                    pathSegment.push(pathCoordinates[i]);
                }
            }
        }

        const totalAnimationDuration = animationDurationPerStep * pathSegment.length;
        const startTime = performance.now();

        const animateTokenStep = () => {
            const currentTime = performance.now();
            let animationProgress = (currentTime - startTime) / (totalAnimationDuration * 1000);

            if (animationProgress < 1) {
                const currentSegmentIndex = Math.min(Math.floor(animationProgress * pathSegment.length), pathSegment.length - 1);
                const segmentProgress = (animationProgress * pathSegment.length) - currentSegmentIndex;

                let startGridPos: [number, number];
                if (currentSegmentIndex === 0) {
                    startGridPos = currentTokenState.isInBase ? player.basePositions[tokenIndex] : currentTokenState.gridPos;
                } else {
                    startGridPos = pathSegment[currentSegmentIndex - 1];
                }

                const endGridPos = pathSegment[currentSegmentIndex];

                const startWorldPos = gridToWorld(startGridPos[0], startGridPos[1]);

                let endWorldPos: THREE.Vector3;
                if (endGridPos[0] === -1 && endGridPos[1] === -1) {
                    endWorldPos = new THREE.Vector3(0, 0.5, 0);
                } else {
                    endWorldPos = gridToWorld(endGridPos[0], endGridPos[1]);
                }

                tokenMesh.position.x = startWorldPos.x + (endWorldPos.x - startWorldPos.x) * segmentProgress;
                tokenMesh.position.y = 0.01;
                tokenMesh.position.z = startWorldPos.z + (endWorldPos.z - startWorldPos.z) * segmentProgress;

                animationFrameId.current = requestAnimationFrame(animateTokenStep);
            } else {
                if (potentialNextState.isHome) {
                    tokenMesh.visible = false;
                    tokenMesh.position.set(0, 0.01, 0);
                    toast({
                        title: "Token Home!",
                        description: `${playerId}'s token reached home.`,
                        status: "success",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                } else {
                    const finalWorldPos = gridToWorld(potentialNextState.gridPos[0], potentialNextState.gridPos[1]);
                    tokenMesh.position.set(finalWorldPos.x, 0.01, finalWorldPos.z);
                }

                if (capturedTokenInfo) {
                    const capturedTokenMesh = tokenMeshMapRef.current.get(capturedTokenInfo.playerId)?.[capturedTokenInfo.tokenIndex];
                    if (capturedTokenMesh) {
                        const originalBaseWorldPos = gridToWorld(capturedTokenInfo.originalBasePos[0], capturedTokenInfo.originalBasePos[1]);
                        capturedTokenMesh.position.set(originalBaseWorldPos.x, 0.01, originalBaseWorldPos.z);
                        capturedTokenMesh.visible = true;
                    }

                    toast({
                        title: "Token Captured!",
                        description: `${playerId} captured a ${capturedTokenInfo.playerId}'s token!`,
                        status: "warning",
                        duration: 3000,
                        isClosable: true,
                        position: "top-right",
                    });
                }

                checkWinCondition();

                if (diceValue === 6) {
                    toast({
                        title: "Rolled a 6!",
                        description: "You get another turn!",
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                    setGamePhase('ROLL_DICE');
                    if (currentPlayerIdRef.current === botPlayerId) { // Use ref
                        setTimeout(() => rollDiceRef.current?.(), 1500);
                    }
                } else {
                    setTimeout(() => endTurnRef.current?.(), 1500);
                }
            }
        };
        animateTokenStep();

    }, [calculateNextPosition, gridToWorld, toast, safeSpots, playerOrder, botPlayerId, checkWinCondition, pathCoordinates]); // `players` removed

    const makeBotMove = useCallback((diceValue: number, movableTokens: number[]) => {
        const botPlayer = playersRef.current[currentPlayerIdRef.current]; // Use ref
        if (!botPlayer || movableTokens.length === 0) {
            setTimeout(() => endTurnRef.current?.(), 0);
            return;
        }

        let chosenTokenIndex: number | null = null;

        if (diceValue === 6) {
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                if (token.isInBase) {
                    chosenTokenIndex = index;
                    break;
                }
            }
        }

        if (chosenTokenIndex === null) {
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                const potentialNextState = calculateNextPosition(token, diceValue, currentPlayerIdRef.current); // Use ref
                if (!potentialNextState || potentialNextState.isHome) continue;

                const isTargetSafeSpot = safeSpots.has(JSON.stringify(potentialNextState.gridPos));
                if (isTargetSafeSpot) continue;

                for (const opponentId of playerOrder) {
                    if (opponentId === currentPlayerIdRef.current) continue; // Use ref
                    const opponentPlayer = playersRef.current[opponentId]; // Use ref
                    if (!opponentPlayer) continue;

                    for (const oppToken of opponentPlayer.tokens) {
                        if (!oppToken.isInBase && !oppToken.isHome &&
                            oppToken.gridPos[0] === potentialNextState.gridPos[0] &&
                            oppToken.gridPos[1] === potentialNextState.gridPos[1]) {
                            chosenTokenIndex = index;
                            break;
                        }
                    }
                    if (chosenTokenIndex !== null) break;
                }
                if (chosenTokenIndex !== null) break;
            }
        }

        if (chosenTokenIndex === null) {
            let maxDistance = -1;
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                const potentialNextState = calculateNextPosition(token, diceValue, currentPlayerIdRef.current); // Use ref
                if (!potentialNextState) continue;

                let currentDistance = 0;
                if (potentialNextState.isHome) {
                    currentDistance = Infinity;
                } else if (potentialNextState.isInHomePath) {
                    currentDistance = pathCoordinates.length + potentialNextState.pathIndex;
                } else {
                    currentDistance = potentialNextState.pathIndex;
                }

                if (currentDistance > maxDistance) {
                    maxDistance = currentDistance;
                    chosenTokenIndex = index;
                }
            }
        }

        if (chosenTokenIndex === null && movableTokens.length > 0) {
            chosenTokenIndex = movableTokens[0];
        }

        if (chosenTokenIndex !== null) {
            moveTokenRef.current?.(currentPlayerIdRef.current, chosenTokenIndex, diceValue); // Use ref
        } else {
            setTimeout(() => endTurnRef.current?.(), 0);
        }
    }, [calculateNextPosition, playerOrder, safeSpots, pathCoordinates]); // Removed `players` and `currentPlayerId`

    const handleTokenClick = useCallback((playerId: string, tokenIndex: number) => {
        if (gamePhaseRef.current === 'SELECT_TOKEN_TO_MOVE' && currentPlayerIdRef.current === playerId && playerId === humanPlayerId) { // Use refs
            if (rolledDiceValueRef.current === null) { // Use ref
                return;
            }
            const movableTokens = getMovableTokens(playerId, rolledDiceValueRef.current); // Use ref
            if (movableTokens.includes(tokenIndex)) {
                moveTokenRef.current?.(playerId, tokenIndex, rolledDiceValueRef.current); // Use ref
            } else {
                toast({
                    title: "Invalid Move",
                    description: "This token cannot be moved with the current dice roll.",
                    status: "error",
                    duration: 1500,
                    isClosable: true,
                    position: "top-right",
                });
            }
        }
    }, [humanPlayerId, getMovableTokens, toast]); // Removed gamePhase, currentPlayerId, rolledDiceValue

    const animate = useCallback(() => {
        animationFrameId.current = requestAnimationFrame(animate);

        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        // const world = worldRef.current; // <--- Potentially remove

        if (!scene || !camera || !renderer) { // If world is removed, remove it from this check
            return;
        }

        camera.fov = THREE.MathUtils.lerp(camera.fov, cameraFocalLength, 0.05);
        camera.updateProjectionMatrix();

        const fixedCameraDistance = 30;
        const verticalAngle = cameraVerticalAngle;
        const horizontalAngle = cameraRotationY;

        const xz_radius = fixedCameraDistance * Math.cos(verticalAngle);
        camera.position.x = xz_radius * Math.sin(horizontalAngle);
        camera.position.y = fixedCameraDistance * Math.sin(verticalAngle);
        camera.position.z = xz_radius * Math.cos(horizontalAngle);

        camera.lookAt(new THREE.Vector3(0, 0, 0));
        camera.updateProjectionMatrix();

        // if (world) { // <--- Potentially remove this block
        //     const fixedTimeStep = 1 / 60;
        //     const maxSubSteps = 10;
        //     world.step(fixedTimeStep, performance.now() / 1000, maxSubSteps);
        // }

        renderer.render(scene, camera);
    }, [cameraFocalLength, cameraVerticalAngle, cameraRotationY]);

    useEffect(() => {
        rollDiceRef.current = rollDice;
    }, [rollDice]);

    useEffect(() => {
        endTurnRef.current = endTurn;
    }, [endTurn]);

    useEffect(() => {
        makeBotMoveRef.current = makeBotMove;
    }, [makeBotMove]);

    useEffect(() => {
        moveTokenRef.current = moveToken;
    }, [moveToken]);

    useEffect(() => {
        handleTokenClickRef.current = handleTokenClick;
    }, [handleTokenClick]);

    useEffect(() => { gamePhaseRef.current = gamePhase; }, [gamePhase]);
    useEffect(() => { currentPlayerIdRef.current = currentPlayerId; }, [currentPlayerId]);
    useEffect(() => { rolledDiceValueRef.current = rolledDiceValue; }, [rolledDiceValue]);
    useEffect(() => { rollsLeftRef.current = rollsLeft; }, [rollsLeft]);

    useEffect(() => {
        if (!mountRef.current) {
            return;
        }
        if (rendererRef.current) {
            return;
        }

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            cameraFocalLength,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        cameraRef.current = camera;

        const initialFixedCameraDistance = 30;
        const initialVerticalAngle = cameraVerticalAngle;
        const initialHorizontalAngle = cameraRotationY;

        const initialXzRadius = initialFixedCameraDistance * Math.cos(initialVerticalAngle);
        camera.position.x = initialXzRadius * Math.sin(initialHorizontalAngle);
        camera.position.y = initialFixedCameraDistance * Math.sin(initialVerticalAngle);
        camera.position.z = initialXzRadius * Math.cos(initialHorizontalAngle);

        camera.lookAt(new THREE.Vector3(0, 0, 0));
        camera.updateProjectionMatrix();

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;
        mountRef.current.appendChild(renderer.domElement);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        scene.add(directionalLight);

        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        scene.add(ambientLight);

        // --- Physics World Initialization ---
        // If CANNON.World is not used for token movement/collisions, this block can be removed.
        // const world = new CANNON.World();
        // world.gravity.set(0, -9.82, 0);
        // world.broadphase = new CANNON.SAPBroadphase(world);
        // worldRef.current = world;

        const groundGeometry = new THREE.PlaneGeometry(50, 50, 10, 10);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            side: THREE.DoubleSide,
        });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        const loader = new GLTFLoader();
        let modelsLoadedCount = 0;
        const totalModelsToLoad = 1 + 1 + 4 + (4 * 4); // Center, Grid, 4 Bases, 16 Tokens

        const checkAllModelsLoaded = () => {
            modelsLoadedCount++;
            if (modelsLoadedCount === totalModelsToLoad) {
                setIsLoading(false);
            }
        };

        const addColoredCell = (row: number, col: number, color: number, height: number = 0.003) => {
            const worldPos = gridToWorld(row, col);
            const cellGeometry = new THREE.PlaneGeometry(1, 1);
            const cellMaterial = new THREE.MeshStandardMaterial({
                color: color,
                side: THREE.DoubleSide,
                roughness: 0.6,
                metalness: 0.0,
            });
            const cellMesh = new THREE.Mesh(cellGeometry, cellMaterial);
            cellMesh.position.set(worldPos.x, height, worldPos.z);
            cellMesh.rotation.x = -Math.PI / 2;
            cellMesh.receiveShadow = true;
            cellMesh.castShadow = false;
            scene.add(cellMesh);
        };

        const playerColors = {
            player1: 0xCC1400,
            player2: 0x00CC00,
            player3: 0x0027CC,
            player4: 0x6C00CD,
        };

        const playerStartPositions: Record<string, [number, number]> = {
            player1: [13, 6],
            player2: [6, 1],
            player3: [1, 8],
            player4: [8, 13],
        };

        const playerHomePaths: Record<string, [number, number][]> = {
            player1: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
            player2: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
            player3: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
            player4: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
        };

        const baseStartCoordinates: Record<string, [number, number]> = {
            player1: [9, 0],
            player2: [0, 0],
            player3: [0, 9],
            player4: [9, 9],
        };

        const relative2x2Pattern: [number, number][] = [[2, 2], [2, 3], [3, 2], [3, 3]];

        const playerStartBaseModelPaths = {
            player1: '/models/p1-start.glb',
            player2: '/models/p2-start.glb',
            player3: '/models/p3-start.glb',
            player4: '/models/p4-start.glb',
        };

        loader.load('/models/center.glb', (gltf) => {
            const model = gltf.scene;
            model.position.set(0, 0.001, 0);
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.receiveShadow = true;
                    child.castShadow = true;
                }
            });
            scene.add(model);
            checkAllModelsLoaded();
        }, undefined, (error) => {
            console.error('An error occurred while loading the center GLB model:', error);
            toast({
                title: "Error loading center model", description: "Could not load the center Ludo piece.",
                status: "error", duration: 5000, isClosable: true, position: "top-right",
            });
            checkAllModelsLoaded();
        });

        loader.load('/models/grid.glb', (gltf) => {
            const gridModel = gltf.scene;
            gridModel.position.set(0, 0.005, 0);
            gridModel.scale.set(1, 1, 1);
            gridModel.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.receiveShadow = true;
                    child.castShadow = false;
                }
            });
            scene.add(gridModel);
            checkAllModelsLoaded();
        }, undefined, (error) => {
            console.error('An error occurred while loading the grid GLB model:', error);
            toast({
                title: "Error loading grid model", description: "Could not load the Ludo grid overlay.",
                status: "error", duration: 5000, isClosable: true, position: "top-right",
            });
            checkAllModelsLoaded();
        });

        Object.entries(playerStartBaseModelPaths).forEach(([playerId, path]) => {
            loader.load(path, (gltf) => {
                const startBaseModel = gltf.scene;
                startBaseModel.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.receiveShadow = true;
                        child.castShadow = true;
                    }
                });
                const [baseStartRow, baseStartCol] = baseStartCoordinates[playerId];
                const centerOfBaseWorldPos = gridToWorld(baseStartRow + 2.5, baseStartCol + 2.5);
                startBaseModel.position.set(centerOfBaseWorldPos.x, 0.001, centerOfBaseWorldPos.z);
                startBaseModel.scale.set(1, 1, 1);
                scene.add(startBaseModel);
                checkAllModelsLoaded();
            }, undefined, (error) => {
                console.error(`An error occurred while loading ${playerId} start base GLB model:`, error);
                toast({
                    title: `Error loading ${playerId} start base model`, description: `Could not load ${playerId} starting area model.`,
                    status: "error", duration: 5000, isClosable: true, position: "top-right",
                });
                for (let i = 0; i < 4; i++) { checkAllModelsLoaded(); } // Ensure counter increments even on error
            });
        });

        for (const player in playerStartPositions) {
            const [row, col] = playerStartPositions[player as keyof typeof playerStartPositions];
            const color = playerColors[player as keyof typeof playerColors];
            addColoredCell(row, col, color);
        }

        for (const player in playerHomePaths) {
            const homePath = playerHomePaths[player as keyof typeof playerHomePaths];
            const color = playerColors[player as keyof typeof playerColors];
            homePath.forEach(([row, col]) => {
                addColoredCell(row, col, color);
            });
        }

        const initialPlayersData: Record<string, Player> = {};
        ['player1', 'player2', 'player3', 'player4'].forEach(id => {
            const [baseStartRow, baseStartCol] = baseStartCoordinates[id];
            const initialTokenStates: TokenState[] = [];
            for (let i = 0; i < 4; i++) {
                const [relativeRow, relativeCol] = relative2x2Pattern[i];
                const gridPos: [number, number] = [baseStartRow + relativeRow, baseStartCol + relativeCol];
                initialTokenStates.push({
                    gridPos: gridPos,
                    pathIndex: -1,
                    isInBase: true,
                    isInHomePath: false,
                    isHome: false,
                });
            }

            initialPlayersData[id] = {
                id,
                tokens: initialTokenStates,
                color: playerColors[id as keyof typeof playerColors],
                startPosition: playerStartPositions[id],
                homePath: playerHomePaths[id],
                basePositions: initialTokenStates.map(token => token.gridPos),
                homePathMainPathEntryIndex: playerHomePathMainPathEntryIndices[id],
            };
            tokenMeshMapRef.current.set(id, []);
        });
        setPlayers(initialPlayersData);

        const playerModelPaths = {
            player1: '/models/player1.glb',
            player2: '/models/player2.glb',
            player3: '/models/player3.glb',
            player4: '/models/player4.glb',
        };

        Object.entries(playerModelPaths).forEach(([playerId, path]) => {
            loader.load(path, (gltf) => {
                const originalPlayerMesh = gltf.scene;
                originalPlayerMesh.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                for (let i = 0; i < 4; i++) {
                    const clonedMesh = originalPlayerMesh.clone();

                    const player = initialPlayersData[playerId];
                    const initialTokenGridPos = player.tokens[i].gridPos;
                    const worldPos = gridToWorld(initialTokenGridPos[0], initialTokenGridPos[1]);
                    clonedMesh.position.set(worldPos.x, 0.01, worldPos.z);
                    clonedMesh.scale.set(0.5, 0.5, 0.5);

                    clonedMesh.userData = { playerId: playerId, tokenIndex: i };
                    scene.add(clonedMesh);

                    tokenMeshMapRef.current.get(playerId)?.push(clonedMesh);
                    checkAllModelsLoaded();
                }
            }, undefined, (error) => {
                console.error(`An error occurred while loading ${playerId} GLB model:`, error);
                toast({
                    title: `Error loading ${playerId} model`, description: `Could not load ${playerId} character.`,
                    status: "error", duration: 5000, isClosable: true, position: "top-right",
                });
                for (let i = 0; i < 4; i++) { checkAllModelsLoaded(); }
            });
        });

        const handleResize = () => {
            if (cameraRef.current && rendererRef.current) {
                cameraRef.current.aspect = window.innerWidth / window.innerHeight;
                cameraRef.current.updateProjectionMatrix();
                rendererRef.current.setSize(window.innerWidth, window.innerHeight);
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);

        const onMouseMove = (event: MouseEvent) => {
            mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
        };

        const onMouseClick = () => {
            if (cameraRef.current && sceneRef.current &&
                gamePhaseRef.current === 'SELECT_TOKEN_TO_MOVE' &&
                currentPlayerIdRef.current === humanPlayerId) {

                if (rolledDiceValueRef.current === null) {
                    return;
                }

                raycaster.current.setFromCamera(mouse.current, cameraRef.current);
                // Optimize raycasting by only checking known token meshes
                const allTokenMeshes: THREE.Object3D[] = [];
                tokenMeshMapRef.current.forEach(meshes => allTokenMeshes.push(...meshes));

                const intersects = raycaster.current.intersectObjects(allTokenMeshes, true);

                for (let i = 0; i < intersects.length; i++) {
                    const intersectedObject = intersects[i].object;
                    let currentParent: THREE.Object3D | null = intersectedObject; // <-- Changed type here
                    while (currentParent && !currentParent.userData.playerId) {
                        currentParent = currentParent.parent;
                    }

                    if (currentParent && currentParent.userData.playerId && currentParent.userData.tokenIndex !== undefined) {
                        const { playerId: clickedPlayerId, tokenIndex: clickedTokenIndex } = currentParent.userData;
                        handleTokenClickRef.current?.(clickedPlayerId, clickedTokenIndex);
                        break;
                    }
                }
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('click', onMouseClick);

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            window.removeEventListener("resize", handleResize);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('click', onMouseClick);

            if (mountRef.current && rendererRef.current) {
                mountRef.current.removeChild(rendererRef.current.domElement);
                rendererRef.current.dispose();
            }
            tokenMeshMapRef.current.forEach(meshes => {
                meshes.forEach(mesh => {
                    scene.remove(mesh);
                    if ((mesh as THREE.Mesh).isMesh) {
                        const m = mesh as THREE.Mesh;
                        if (m.geometry) m.geometry.dispose();
                        if (Array.isArray(m.material)) {
                            m.material.forEach(mat => mat.dispose());
                        } else if (m.material) {
                            m.material.dispose();
                        }
                    }
                });
            });
        };
    }, [cameraFocalLength, cameraVerticalAngle, cameraRotationY, gridToWorld, toast, humanPlayerId, pathCoordinates, playerHomePathMainPathEntryIndices]); // Added static deps

    useEffect(() => {
        if (!isLoading && sceneRef.current && cameraRef.current && rendererRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
            animate();
        }
    }, [isLoading, animate]);

    useEffect(() => {
        if (!isLoading && !hasInitializedGame.current) {
            hasInitializedGame.current = true;

            setCurrentPlayerId(playerOrder[0]);
            setGamePhase('ROLL_DICE');
            setRollsLeft(1);

            let title = "Welcome to Ludo Sync!";
            let description = "Select a game mode from the home page.";
            if (gameMode === "play-with-bot") {
                title = "Game Mode: Bot Only";
                description = "You're playing against the AI (Player 3). Player 2 and 4 are inactive.";
            } else if (gameMode === "local-friends") {
                title = "Game Mode: Friends (Over the Table)";
                description = "You've chosen to play with friends locally. All players are human.";
            } else if (gameMode === "multiplayer") {
                title = "Game Mode: Multiplayer (Online)";
                description = "You've chosen to play with others online! (Basic bot for Player 3).";
            }
            toast({ title, description, status: "info", duration: 5000, isClosable: true, position: "top-right", });

            if (playerOrder[0] === botPlayerId) {
                setTimeout(() => {
                    rollDiceRef.current?.();
                }, 1500);
            }
        }
    }, [isLoading, searchParams, toast, humanPlayerId, botPlayerId, gameMode, playerOrder]);

    useEffect(() => {
        playerOrder.forEach(pId => {
            const player = players[pId];
            if (player) {
                player.tokens.forEach(token => {
                    if (!token.isHome && token.gridPos && token.gridPos[0] !== -1 && token.gridPos[1] !== -1) {
                        adjustTokensInCell(token.gridPos[0], token.gridPos[1]);
                    }
                });
                player.basePositions.forEach(basePos => {
                    adjustTokensInCell(basePos[0], basePos[1]);
                });
            }
        });
    }, [players, adjustTokensInCell, playerOrder]);

    const getCameraFocalLengthForDisplay = useCallback(() => {
        return cameraRef.current ? cameraRef.current.fov : cameraFocalLength;
    }, [cameraFocalLength]);

    useEffect(() => {
        // Add a null check here to ensure sceneRef.current is not null before proceeding
        if (!sceneRef.current) {
            return; // If sceneRef.current is null, exit the effect early.
        }

        // Now, TypeScript knows that sceneRef.current is NOT null in the code below this line.
        indicatorMeshesRef.current.forEach(mesh => mesh.visible = false);

        if (gamePhase === 'SELECT_TOKEN_TO_MOVE') {
            if (rolledDiceValue !== null && currentPlayerId === humanPlayerId) {
                const movableTokens = getMovableTokens(currentPlayerId, rolledDiceValue);

                movableTokens.forEach((tokenIndex) => {
                    const key = `${currentPlayerId}-${tokenIndex}`;
                    let indicatorMesh = indicatorMeshesRef.current.get(key);

                    const tokenMesh = tokenMeshMapRef.current.get(currentPlayerId)?.[tokenIndex];

                    if (tokenMesh) {
                        if (!indicatorMesh) {
                            indicatorMesh = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
                            // This line should now be safe because of the check at the top
                            sceneRef.current!.add(indicatorMesh);
                            indicatorMeshesRef.current.set(key, indicatorMesh);
                        }
                        indicatorMesh.position.copy(tokenMesh.position);
                        indicatorMesh.position.y += 1.5;
                        indicatorMesh.scale.set(0.5, 0.5, 0.5);
                        indicatorMesh.visible = true;
                    }
                });
            }
        }
    }, [gamePhase, currentPlayerId, rolledDiceValue, humanPlayerId, getMovableTokens, indicatorGeometry, indicatorMaterial]);

    return (
        <Box
            ref={mountRef}
            sx={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                position: "relative",
                _focus: { outline: "none" },
            }}
            tabIndex={-1}
        >
            {isLoading && (
                <Center
                    position="absolute"
                    top="0"
                    left="0"
                    width="100%"
                    height="100%"
                    bg="rgba(0,0,0,0.7)"
                    zIndex="20"
                    flexDirection="column"
                >
                    <Spinner size="xl" color="white" mb={4} />
                    <Text color="white" fontSize="xl">
                        Loading Ludo World...
                    </Text>
                </Center>
            )}

            {!isLoading && gamePhase !== 'GAME_OVER' && (
                <Box
                    position="absolute"
                    top="4"
                    left="4"
                    bg="rgba(0,0,0,0.6)"
                    p={4}
                    borderRadius="md"
                    color="white"
                    zIndex="10"
                >
                    <Text fontSize="xl" mb={2}>Current Turn: {currentPlayerId.replace('player', 'Player ')}</Text>
                    {rolledDiceValue !== null && <Text fontSize="lg" mb={2}>Last Roll: {rolledDiceValue}</Text>}
                    {gamePhase === 'ROLL_DICE' && currentPlayerId === humanPlayerId && rollsLeft > 0 && (
                        <Text fontSize="md" mt={2}>Rolls Left: {rollsLeft}</Text>
                    )}
                    {gamePhase === 'SELECT_TOKEN_TO_MOVE' && currentPlayerId === humanPlayerId && (
                        <Text fontSize="md" mt={2}>Click on a token to move it.</Text>
                    )}
                    {gamePhase === 'ANIMATING_MOVE' && (
                        <Text fontSize="md" mt={2}>Animating move...</Text>
                    )}
                    {gamePhase === 'ROLL_DICE' && currentPlayerId === botPlayerId && (
                        <Text fontSize="md" mt={2}>Bot is rolling...</Text>
                    )}
                </Box>
            )}

            {!isLoading && gamePhase === 'ROLL_DICE' && currentPlayerId === humanPlayerId && (
                <Box
                    position="absolute"
                    bottom="4"
                    right="4"
                    zIndex="10"
                >
                    <Button onClick={() => rollDiceRef.current?.()} colorScheme="teal" size="lg" p={6} borderRadius="full" boxShadow="lg">
                        Roll Dice
                    </Button>
                </Box>
            )}

            {!isLoading && (
                <Flex
                    position="absolute"
                    top="50%"
                    right="4"
                    transform="translateY(-50%)"
                    zIndex="10"
                    height="250px"
                    width="40px"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="space-between"
                    bg="rgba(0,0,0,0.6)"
                    borderRadius="md"
                    p={1}
                >
                    <IconButton
                        aria-label="Increase vertical angle"
                        icon={<ChevronUpIcon />}
                        size="sm"
                        onClick={() => setCameraVerticalAngle(prev => Math.min(prev + 0.01, Math.PI / 2))}
                        colorScheme="teal"
                        mb={1}
                    />
                    <Slider
                        aria-label="camera-vertical-angle-slider"
                        orientation="vertical"
                        min={10 * Math.PI / 180}
                        max={Math.PI / 2}
                        step={0.01}
                        value={cameraVerticalAngle}
                        onChange={(val) => setCameraVerticalAngle(val)}
                        flex="1"
                    >
                        <SliderTrack bg="gray.600">
                        </SliderTrack>
                        <SliderThumb boxSize={6} />
                    </Slider>
                    <IconButton
                        aria-label="Decrease vertical angle"
                        icon={<ChevronDownIcon />}
                        size="sm"
                        onClick={() => setCameraVerticalAngle(prev => Math.max(prev - 0.01, 10 * Math.PI / 180))}
                        colorScheme="teal"
                        mt={1}
                    />
                </Flex>
            )}

            {!isLoading && (
                <Flex
                    position="absolute"
                    bottom="4"
                    left="50%"
                    transform="translateX(-50%)"
                    zIndex="10"
                    width="350px"
                    bg="rgba(0,0,0,0.6)"
                    borderRadius="md"
                    p={2}
                    alignItems="center"
                    justifyContent="space-between"
                >
                    <IconButton
                        aria-label="Rotate camera left"
                        icon={<ChevronLeftIcon />}
                        size="sm"
                        onClick={() => setCameraRotationY(prev => Math.max(prev - 0.01, -Math.PI / 6))}
                        colorScheme="teal"
                        mr={1}
                    />
                    <Slider
                        aria-label="camera-horizontal-rotation-slider"
                        min={-Math.PI / 6}
                        max={Math.PI / 6}
                        step={0.01}
                        value={cameraRotationY}
                        onChange={(val) => setCameraRotationY(val)}
                        flex="1"
                    >
                        <SliderTrack bg="gray.600">
                        </SliderTrack>
                        <SliderThumb boxSize={6} />
                    </Slider>
                    <IconButton
                        aria-label="Rotate camera right"
                        icon={<ChevronRightIcon />}
                        size="sm"
                        onClick={() => setCameraRotationY(prev => Math.min(prev + 0.01, Math.PI / 6))}
                        colorScheme="teal"
                        ml={1}
                    />
                </Flex>
            )}

            {!isLoading && (
                <FocalLengthControls
                    getFocalLength={getCameraFocalLengthForDisplay}
                    onIncrease={() => setCameraFocalLength(prev => Math.min(prev + 5, 80))}
                    onDecrease={() => setCameraFocalLength(prev => Math.max(prev - 5, 10))}
                />
            )}

            {gamePhase === 'GAME_OVER' && winner && (
                <Center
                    position="absolute"
                    top="0"
                    left="0"
                    width="100%"
                    height="100%"
                    bg="rgba(0,0,0,0.8)"
                    zIndex="30"
                    flexDirection="column"
                >
                    <Text color="white" fontSize="4xl" fontWeight="bold" mb={4}>
                        Game Over!
                    </Text>
                    <Text color="white" fontSize="3xl">
                        {winner.replace('player', 'Player ')} wins!
                    </Text>
                </Center>
            )}
        </Box>
    );
}