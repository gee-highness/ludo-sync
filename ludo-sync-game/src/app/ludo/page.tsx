"use client"; // This is crucial for client-side rendering

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Box, Spinner, Center, Text, useToast, Button, Slider, SliderTrack, SliderFilledTrack, SliderThumb, IconButton, Flex } from "@chakra-ui/react";
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons'; // Import icons
import { useSearchParams } from "next/navigation";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'; // Import GLTFLoader

// Define a type for a single token's state
interface TokenState {
    gridPos: [number, number]; // Current [row, col] on the 15x15 grid
    pathIndex: number; // Index on pathCoordinates or homePath, or -1 if in base, -2 if home
    isInBase: boolean;
    isInHomePath: boolean;
    isHome: boolean; // True if token reached the center
}

// Define a type for player data (meshes are now managed externally)
interface Player {
    id: string;
    tokens: TokenState[]; // Array of token states
    color: number;
    startPosition: [number, number]; // The initial grid position for entering the game (on main path)
    homePath: [number, number][]; // Path to the center
    basePositions: [number, number][]; // Positions in the player's starting base (e.g., [14,14], [14,13], etc.)
    homePathMainPathEntryIndex: number; // Index on main path where player enters home path
}

// Define game phases
type GamePhase = 'IDLE' | 'ROLL_DICE' | 'SELECT_TOKEN_TO_MOVE' | 'ANIMATING_MOVE' | 'GAME_OVER';

// New component for Focal Length Controls
interface FocalLengthControlsProps {
    // This prop now takes a function to get the current FOV directly from the camera
    getFocalLength: () => number;
    onIncrease: () => void; // This should decrease FOV (zoom in)
    onDecrease: () => void; // This should increase FOV (zoom out)
}

const FocalLengthControls: React.FC<FocalLengthControlsProps> = ({
    getFocalLength,
    onIncrease,
    onDecrease,
}) => {
    // Use a local state to re-render this component when FOV changes
    const [displayFocalLength, setDisplayFocalLength] = useState(getFocalLength());

    // Update displayFocalLength periodically or when getFocalLength changes
    useEffect(() => {
        const interval = setInterval(() => {
            setDisplayFocalLength(getFocalLength());
        }, 100); // Update every 100ms for smooth display

        return () => clearInterval(interval);
    }, [getFocalLength]);

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
            {/* "Zoom In (+)" should decrease FOV, so it calls onDecrease */}
            <Button onClick={onDecrease} size="sm" colorScheme="teal" width="full">
                Zoom In (+)
            </Button>
            {/* "Zoom Out (-)" should increase FOV, so it calls onIncrease */}
            <Button onClick={onIncrease} size="sm" colorScheme="teal" width="full">
                Zoom Out (-)
            </Button>
        </Box>
    );
};


export default function LudoPage() {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const worldRef = useRef<CANNON.World | null>(null);
    const animationFrameId = useRef<number | null>(null);

    // Ref to store all Three.js token meshes, managed outside React state
    const tokenMeshMapRef = useRef<Map<string, THREE.Object3D[]>>(new Map());

    const [isLoading, setIsLoading] = useState(true);
    const toast = useToast();
    const searchParams = useSearchParams();

    // Game State Management
    const [gamePhase, setGamePhase] = useState<GamePhase>('IDLE');
    const [currentPlayerId, setCurrentPlayerId] = useState<string>('player1');
    const [rolledDiceValue, setRolledDiceValue] = useState<number | null>(null);
    const [players, setPlayers] = useState<Record<string, Player>>({}); // State to hold player data
    const [playerOrder] = useState<string[]>(['player1', 'player3']); // Order of active players
    const [winner, setWinner] = useState<string | null>(null); // State for winner
    const [rollsLeft, setRollsLeft] = useState<number>(1); // Rolls left for current player

    // Camera control states
    // cameraFocalLength is now the TARGET focal length, not the current animated one
    const [cameraFocalLength, setCameraFocalLength] = useState<number>(40);
    // cameraVerticalAngle represents the vertical angle (elevation) in radians
    const [cameraVerticalAngle, setCameraVerticalAngle] = useState<number>(45 * Math.PI / 180); // Default to 45 degrees elevation
    const [cameraRotationY, setCameraRotationY] = useState<number>(0); // Horizontal rotation

    // Derive gameMode directly from searchParams
    const gameMode = searchParams.get('mode') as 'play-with-bot' | 'local-friends' | 'multiplayer' || null;

    // Derive humanPlayerId and botPlayerId directly from gameMode (which is derived from searchParams)
    const { humanPlayerId, botPlayerId } = useMemo(() => {
        let derivedHumanPlayerId: string | null = null;
        let derivedBotPlayerId: string | null = null;

        if (gameMode === 'play-with-bot') {
            derivedHumanPlayerId = 'player1';
            derivedBotPlayerId = 'player3';
        } else if (gameMode === 'local-friends') {
            derivedHumanPlayerId = 'player1'; // Assuming player1 is the first human
            derivedBotPlayerId = null;
        } else if (gameMode === 'multiplayer') {
            derivedHumanPlayerId = 'player1';
            derivedBotPlayerId = 'player3'; // Example: player3 is a bot, player2/4 inactive
        }
        console.log(`useMemo: Derived humanPlayerId: ${derivedHumanPlayerId}, botPlayerId: ${derivedBotPlayerId} for gameMode: ${gameMode}`);
        return { humanPlayerId: derivedHumanPlayerId, botPlayerId: derivedBotPlayerId };
    }, [gameMode]);


    // Ref to ensure game initialization runs only once
    const hasInitializedGame = useRef(false);

    // Raycasting for token selection
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());

    // Refs for mutually dependent functions
    const rollDiceRef = useRef<(() => void) | null>(null);
    const endTurnRef = useRef<(() => void) | null>(null);
    const makeBotMoveRef = useRef<((diceValue: number, movableTokens: number[]) => void) | null>(null);
    const moveTokenRef = useRef<((playerId: string, tokenIndex: number, diceValue: number) => void) | null>(null);
    const handleTokenClickRef = useRef<((playerId: string, tokenIndex: number) => void) | null>(null);

    // Refs to store the latest state values for event listeners (to prevent stale closures)
    const gamePhaseRef = useRef<GamePhase>('IDLE');
    const currentPlayerIdRef = useRef<string>('player1');
    const rolledDiceValueRef = useRef<number | null>(null);
    const rollsLeftRef = useRef<number>(1);


    // Helper function to convert grid coordinates to world coordinates
    const gridToWorld = useCallback((row: number, col: number) => {
        const worldX = col - 7;
        const worldZ = row - 7;
        return new THREE.Vector3(worldX, 0.5, worldZ); // Y adjusted for token height
    }, []);

    // Define the main circular path on the 15x15 grid (52 cells)
    const pathCoordinates: [number, number][] = [
        // --- Player 1 (Red) Path Segment ---
        [13, 6], // Red's start square (safe spot) - Index 0
        [12, 6], [11, 6], [10, 6], [9, 6], [8, 6], // Upwards
        [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // Leftwards
        // --- Player 2 (Green) Path Segment ---
        [7, 0], // Green's start square (safe spot) - Index 13
        [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // Rightwards
        [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // Upwards
        // --- Player 3 (Yellow) Path Segment ---
        [0, 7], // Yellow's start square (safe spot) - Index 26
        [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // Downwards
        [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], // Rightwards
        // --- Player 4 (Blue) Path Segment ---
        [7, 14], // Blue's start square (safe spot) - Index 39
        [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // Leftwards
        [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // Downwards
        [14, 7] // Cell just before Red's home path entry - Index 51
    ];

    // Player Specific Home Path Entry Points (index on the main pathCoordinates array)
    const playerHomePathMainPathEntryIndices: Record<string, number> = {
        player1: 51, // Index of [14, 7] for Red
        player2: 12, // Index of [7, 0] for Green
        player3: 25, // Index of [0, 7] for Yellow
        player4: 38, // Index of [7, 14] for Blue
    };

    // Define Safe Spots (star squares and player start squares)
    // Using JSON.stringify to allow array keys in a Set for efficient lookup
    const safeSpots: Set<string> = new Set([
        // Player start squares (which are also star spots)
        JSON.stringify([13, 6]), // Red's start
        JSON.stringify([6, 1]),  // Green's start
        JSON.stringify([1, 8]),  // Yellow's start
        JSON.stringify([8, 13]), // Blue's start
        // Other star spots on the board
        //        JSON.stringify([12, 8]), // Path index 48
        //      JSON.stringify([8, 2]),  // Path index 7
        //    JSON.stringify([2, 6]),  // Path index 20
        //  JSON.stringify([6, 12]), // Path index 33
    ]);

    // Helper to calculate the next position of a token
    const calculateNextPosition = useCallback((
        tokenState: TokenState,
        steps: number,
        playerId: string
    ): TokenState | null => {
        const player = players[playerId];
        if (!player) {
            return null;
        }

        if (tokenState.isInBase) {
            if (steps === 6) {
                const newPathIndex = pathCoordinates.findIndex(p => p[0] === player.startPosition[0] && p[1] === player.startPosition[1]);
                return { gridPos: player.startPosition, pathIndex: newPathIndex, isInBase: false, isInHomePath: false, isHome: false };
            } else {
                return null; // Cannot move from base without a 6
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
        } else { // On main path
            const currentMainPathIndex = tokenState.pathIndex;
            let targetMainPathIndex = currentMainPathIndex + steps;

            // Check if entering home path
            if (currentMainPathIndex <= player.homePathMainPathEntryIndex && targetMainPathIndex > player.homePathMainPathEntryIndex) {
                const stepsIntoHomePath = targetMainPathIndex - player.homePathMainPathEntryIndex - 1;
                if (stepsIntoHomePath < player.homePath.length) {
                    return { gridPos: player.homePath[stepsIntoHomePath], pathIndex: stepsIntoHomePath, isInBase: false, isInHomePath: true, isHome: false };
                } else if (stepsIntoHomePath === player.homePath.length) {
                    return { gridPos: [-1, -1], pathIndex: -2, isInBase: false, isInHomePath: false, isHome: true };
                } else {
                    return null; // Overshot home
                }
            } else {
                const newPathIndex = targetMainPathIndex % pathCoordinates.length;
                const newGridPos = pathCoordinates[newPathIndex];
                return { gridPos: newGridPos, pathIndex: newPathIndex, isInBase: false, isInHomePath: false, isHome: false };
            }
        }
    }, [players, pathCoordinates]);


    // Helper to get movable tokens for the current player
    const getMovableTokens = useCallback((playerId: string, diceValue: number): number[] => {
        const movableTokenIndices: number[] = [];
        const player = players[playerId];

        if (!player) {
            return [];
        }

        player.tokens.forEach((token, index) => {
            if (token.isHome) {
                return; // Token already home, cannot move
            }

            const potentialNextState = calculateNextPosition(token, diceValue, playerId);

            if (potentialNextState) {
                // REMOVED: The check for 'isBlockedByOwnToken' is removed.
                // Players can now land on cells occupied by their own tokens.
                movableTokenIndices.push(index);
            }
        });
        return movableTokenIndices;
    }, [players, calculateNextPosition, safeSpots]);



    // Check for win condition
    const checkWinCondition = useCallback(() => {
        for (const playerId of playerOrder) { // Only check active players
            const player = players[playerId];
            if (!player) {
                continue;
            }

            // A player wins when all 4 of their tokens are in the home position
            const tokensInHome = player.tokens.filter(token => token.isHome).length;
            if (tokensInHome === 4) {
                setWinner(playerId);
                setGamePhase('GAME_OVER');
                toast({
                    title: "Game Over!",
                    description: `${playerId.replace('player', 'Player ')} wins the game!`,
                    status: "success",
                    duration: null, // Keep open until closed by user
                    isClosable: true,
                    position: "top",
                });
                break;
            }
        }
    }, [players, playerOrder, toast]);


    // Function to end the current player's turn and switch to the next
    const endTurn = useCallback(() => {
        setRolledDiceValue(null); // Clear dice value for next turn
        setRollsLeft(1); // Reset rolls for the next player
        const currentIndex = playerOrder.indexOf(currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerOrder.length;
        const nextPlayer = playerOrder[nextIndex];

        setCurrentPlayerId(nextPlayer);
        setGamePhase('ROLL_DICE');

        // If the next player is a bot, automatically trigger their roll after a delay
        if (nextPlayer === botPlayerId) {
            setTimeout(() => {
                rollDiceRef.current?.(); // Call via ref
            }, 1500);
        }
    }, [currentPlayerId, playerOrder, botPlayerId]);


    // Function to roll the dice
    const rollDice = useCallback(() => {
        if (gamePhase !== 'ROLL_DICE' || winner) {
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

        const movableTokens = getMovableTokens(currentPlayerId, diceResult);

        if (diceResult === 6) {
            // If 6 is rolled, player gets another roll after moving
            setRollsLeft(prev => prev + 1); // Increment rolls left for next turn
            if (movableTokens.length > 0) {
                setGamePhase('SELECT_TOKEN_TO_MOVE');
                if (currentPlayerId === botPlayerId) {
                    setTimeout(() => {
                        makeBotMoveRef.current?.(diceResult, movableTokens); // Call via ref
                    }, 1000); // Simulate bot thinking time
                }
            } else {
                // Rolled a 6 but no moves possible, still get another roll
                toast({
                    title: "Rolled a 6, but no moves!",
                    description: "You get another turn!",
                    status: "info",
                    duration: 2000,
                    isClosable: true,
                    position: "top-right",
                });
                setTimeout(() => rollDiceRef.current?.(), 1500); // Trigger another roll
            }
        } else {
            // Not a 6
            if (movableTokens.length > 0) {
                setGamePhase('SELECT_TOKEN_TO_MOVE');
                setRollsLeft(prev => prev - 1); // Decrement rolls, as this is a regular move
                if (currentPlayerId === botPlayerId) {
                    setTimeout(() => {
                        makeBotMoveRef.current?.(diceResult, movableTokens); // Call via ref
                    }, 1000); // Simulate bot thinking time
                }
            } else {
                // No movable tokens, and not a 6. Check if more rolls are allowed.
                if (rollsLeftRef.current > 1) { // Use ref for latest value
                    setRollsLeft(prev => prev - 1);
                    toast({
                        title: "No possible moves",
                        description: `You have ${rollsLeftRef.current - 1} rolls left.`,
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                    setTimeout(() => rollDiceRef.current?.(), 1500); // Trigger another roll
                } else {
                    toast({
                        title: "No possible moves",
                        description: "Your tokens cannot move. Turn passes.",
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                    setTimeout(() => endTurnRef.current?.(), 1500); // Call via ref
                }
            }
        }
    }, [gamePhase, currentPlayerId, botPlayerId, winner, toast, getMovableTokens]);


    // Function to move a token and handle game logic
    const moveToken = useCallback((playerId: string, tokenIndex: number, diceValue: number) => {
        const player = players[playerId];
        if (!player || tokenIndex < 0 || tokenIndex >= player.tokens.length) {
            console.error(`moveToken: Invalid player or token index. Player: ${playerId}, Index: ${tokenIndex}`);
            return;
        }

        const currentTokenState = player.tokens[tokenIndex];
        const potentialNextState = calculateNextPosition(currentTokenState, diceValue, playerId);

        if (!potentialNextState) {
            console.error("moveToken: Attempted to move to an invalid position. This should not happen if getMovableTokens is correct.");
            return;
        }

        setGamePhase('ANIMATING_MOVE');

        // Perform capture logic if not going to home and not on a safe spot
        let capturedTokenInfo: { playerId: string; tokenIndex: number; originalBasePos: [number, number]; } | null = null;
        const isTargetSafeSpot = safeSpots.has(JSON.stringify(potentialNextState.gridPos));

        // Check for capture of opponent's token OR self-capture (if moving out of base)
        if (!potentialNextState.isHome) { // Captures only happen if not landing home
            for (const opponentId of playerOrder) {
                const opponentPlayer = players[opponentId];
                if (!opponentPlayer) continue;

                for (let oppIndex = 0; oppIndex < opponentPlayer.tokens.length; oppIndex++) {
                    const opponentToken = opponentPlayer.tokens[oppIndex];
                    // A token can be captured if it's not in base, not home, and on the target square
                    if (!opponentToken.isInBase && !opponentToken.isHome &&
                        opponentToken.gridPos[0] === potentialNextState.gridPos[0] &&
                        opponentToken.gridPos[1] === potentialNextState.gridPos[1]) {

                        // If it's an opponent's token AND the target is not a safe spot, capture it.
                        // If it's your own token AND the current token is moving out of base (dice=6), capture it (self-capture).
                        if ((opponentId !== playerId && !isTargetSafeSpot)) {
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


        // Update the position in state *before* animation
        setPlayers(prevPlayers => {
            const newPlayers = { ...prevPlayers };
            // Update current player's token
            newPlayers[playerId] = {
                ...newPlayers[playerId],
                tokens: newPlayers[playerId].tokens.map((token, idx) =>
                    idx === tokenIndex ? potentialNextState : token
                ),
            };

            // If a token was captured, update its state to be back in base
            if (capturedTokenInfo) {
                const { playerId: capturedPId, tokenIndex: capturedTIdx, originalBasePos } = capturedTokenInfo;
                newPlayers[capturedPId] = {
                    ...newPlayers[capturedPId],
                    tokens: newPlayers[capturedPId].tokens.map((token, idx) =>
                        idx === capturedTIdx ? {
                            gridPos: originalBasePos,
                            pathIndex: -1, // Indicate back in base
                            isInBase: true,
                            isInHomePath: false,
                            isHome: false,
                        } : token
                    ),
                };
            }
            return newPlayers;
        });

        // Get the actual Three.js mesh from the ref
        const tokenMesh = tokenMeshMapRef.current.get(playerId)?.[tokenIndex];
        if (!tokenMesh) {
            console.error(`moveToken: Mesh for player ${playerId} token ${tokenIndex} not found in ref.`);
            return;
        }

        const animationDurationPerStep = 0.2; // seconds per grid cell
        const pathSegment: [number, number][] = []; // Path for animation

        // Determine animation path
        if (currentTokenState.isInBase) {
            pathSegment.push(player.startPosition);
        } else if (currentTokenState.isInHomePath) {
            const currentHomePathIndex = player.homePath.findIndex(p => p[0] === currentTokenState.gridPos[0] && p[1] === currentTokenState.gridPos[1]);
            for (let i = 1; i <= diceValue; i++) {
                if (currentHomePathIndex + i < player.homePath.length) {
                    pathSegment.push(player.homePath[currentHomePathIndex + i]);
                } else if (currentHomePathIndex + i === player.homePath.length) {
                    pathSegment.push([-1, -1]); // Represent "home"
                    break;
                } else {
                    break; // Overshot home
                }
            }
        } else { // On main path
            const currentMainPathIndex = currentTokenState.pathIndex;
            for (let i = 1; i <= diceValue; i++) {
                let nextPathIndex = (currentMainPathIndex + i);
                // Check if entering home path
                if (currentMainPathIndex <= player.homePathMainPathEntryIndex && nextPathIndex > player.homePathMainPathEntryIndex) {
                    const stepsIntoHomePath = nextPathIndex - player.homePathMainPathEntryIndex - 1;
                    if (stepsIntoHomePath < player.homePath.length) {
                        pathSegment.push(player.homePath[stepsIntoHomePath]);
                    } else if (stepsIntoHomePath === player.homePath.length) {
                        pathSegment.push([-1, -1]); // Represent "home"
                        break;
                    } else {
                        return null; // Overshot home
                    }
                } else {
                    pathSegment.push(pathCoordinates[nextPathIndex % pathCoordinates.length]);
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
                const segmentProgress = (animationProgress * pathSegment.length) - currentSegmentIndex; // Progress within the current segment

                let startPoint: THREE.Vector3;
                if (currentSegmentIndex === 0) {
                    startPoint = gridToWorld(currentTokenState.gridPos[0], currentTokenState.gridPos[1]);
                } else {
                    const prevPos = pathSegment[currentSegmentIndex - 1];
                    startPoint = gridToWorld(prevPos[0], prevPos[1]);
                }

                const endPoint = potentialNextState.isHome && currentSegmentIndex === pathSegment.length - 1 ? new THREE.Vector3(0, 0.5, 0) : gridToWorld(pathSegment[currentSegmentIndex][0], pathSegment[currentSegmentIndex][1]);

                tokenMesh.position.x = startPoint.x + (endPoint.x - startPoint.x) * segmentProgress;
                tokenMesh.position.z = startPoint.z + (endPoint.z - startPoint.z) * segmentProgress;
                tokenMesh.position.y = 0.5 + Math.sin(segmentProgress * Math.PI) * 0.2; // Bounce effect

                animationFrameId.current = requestAnimationFrame(animateTokenStep);
            } else {
                // Animation finished, snap to final position
                if (potentialNextState.isHome) {
                    tokenMesh.visible = false; // Hide token when it's home
                    tokenMesh.position.set(0, 0.5, 0); // Move to center of home for consistency
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
                    tokenMesh.position.set(finalWorldPos.x, 0.5, finalWorldPos.z); // Snap to final position
                }

                // Handle captured token animation (move back to base)
                if (capturedTokenInfo) {
                    const capturedTokenMesh = tokenMeshMapRef.current.get(capturedTokenInfo.playerId)?.[capturedTokenInfo.tokenIndex];
                    if (capturedTokenMesh) {
                        const capturedTokenWorldPos = gridToWorld(capturedTokenInfo.originalBasePos[0], capturedTokenInfo.originalBasePos[1]);
                        capturedTokenMesh.position.set(capturedTokenWorldPos.x, 0.5, capturedTokenWorldPos.z);
                        capturedTokenMesh.visible = true; // Ensure it's visible
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

                // If a 6 was rolled, the player gets another turn. Otherwise, turn passes.
                if (diceValue === 6) {
                    toast({
                        title: "Rolled a 6!",
                        description: "You get another turn!",
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                        position: "top-right",
                    });
                    setGamePhase('ROLL_DICE'); // Current player gets another turn
                    if (currentPlayerId === botPlayerId) {
                        setTimeout(() => rollDiceRef.current?.(), 1500); // Call via ref
                    }
                } else {
                    setTimeout(() => endTurnRef.current?.(), 1500); // Call via ref
                }
            }
        };
        animateTokenStep();

    }, [players, calculateNextPosition, gridToWorld, toast, safeSpots, playerOrder, botPlayerId, checkWinCondition, pathCoordinates]);


    // Basic Bot AI logic
    const makeBotMove = useCallback((diceValue: number, movableTokens: number[]) => {
        const botPlayer = players[currentPlayerId];
        if (!botPlayer || movableTokens.length === 0) {
            setTimeout(() => endTurnRef.current?.(), 0); // Call via ref
            return;
        }

        let chosenTokenIndex: number | null = null;

        // Strategy 1: If a 6 is rolled, prioritize moving a token out of base
        if (diceValue === 6) {
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                if (token.isInBase) {
                    chosenTokenIndex = index;
                    break;
                }
            }
        }

        // Strategy 2: Try to capture an opponent's token
        if (chosenTokenIndex === null) {
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                const potentialNextState = calculateNextPosition(token, diceValue, currentPlayerId);
                if (!potentialNextState || potentialNextState.isHome) continue;

                const isTargetSafeSpot = safeSpots.has(JSON.stringify(potentialNextState.gridPos));
                if (isTargetSafeSpot) continue; // Cannot capture on safe spot

                for (const opponentId of playerOrder) {
                    if (opponentId === currentPlayerId) continue;
                    const opponentPlayer = players[opponentId];
                    if (!opponentPlayer) continue;

                    for (const oppToken of opponentPlayer.tokens) {
                        if (!oppToken.isInBase && !oppToken.isHome &&
                            oppToken.gridPos[0] === potentialNextState.gridPos[0] &&
                            oppToken.gridPos[1] === potentialNextState.gridPos[1]) {
                            chosenTokenIndex = index; // This token can capture
                            break;
                        }
                    }
                    if (chosenTokenIndex !== null) break;
                }
                if (chosenTokenIndex !== null) break;
            }
        }

        // Strategy 3: Otherwise, move the token furthest along the path (or closest to home)
        if (chosenTokenIndex === null) {
            let maxDistance = -1; // Higher distance means further along the path
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                const potentialNextState = calculateNextPosition(token, diceValue, currentPlayerId);
                if (!potentialNextState) continue;

                let currentDistance = 0;
                if (potentialNextState.isHome) {
                    currentDistance = Infinity; // Prioritize getting home
                } else if (potentialNextState.isInHomePath) {
                    currentDistance = pathCoordinates.length + potentialNextState.pathIndex; // Main path length + home path index
                } else {
                    currentDistance = potentialNextState.pathIndex; // Index on main path
                }

                if (currentDistance > maxDistance) {
                    maxDistance = currentDistance;
                    chosenTokenIndex = index;
                }
            }
        }

        // Fallback: If for some reason no specific strategy applied, just pick the first movable token
        if (chosenTokenIndex === null && movableTokens.length > 0) {
            chosenTokenIndex = movableTokens[0];
        }

        if (chosenTokenIndex !== null) {
            moveTokenRef.current?.(currentPlayerId, chosenTokenIndex, diceValue); // Call via ref
        } else {
            // This case indicates a logic error or no valid moves despite getMovableTokens returning options
            console.error("makeBotMove: Bot could not find a token to move, passing turn. This indicates a logic error.");
            setTimeout(() => endTurnRef.current?.(), 0); // Call via ref
        }
    }, [players, currentPlayerId, calculateNextPosition, playerOrder, safeSpots, pathCoordinates]);


    // Function to handle token click for human players
    const handleTokenClick = useCallback((playerId: string, tokenIndex: number) => {
        if (gamePhase === 'SELECT_TOKEN_TO_MOVE' && currentPlayerId === playerId && playerId === humanPlayerId) {
            if (rolledDiceValue === null) {
                console.error("handleTokenClick: Dice value is null when trying to move token. This should not happen.");
                return;
            }
            const movableTokens = getMovableTokens(playerId, rolledDiceValue);
            if (movableTokens.includes(tokenIndex)) {
                moveTokenRef.current?.(playerId, tokenIndex, rolledDiceValue); // Call via ref
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
    }, [gamePhase, currentPlayerId, humanPlayerId, rolledDiceValue, getMovableTokens, toast]);


    const animate = useCallback(() => {
        animationFrameId.current = requestAnimationFrame(animate);

        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        const world = worldRef.current;

        if (!scene || !camera || !renderer || !world) {
            return;
        }

        // Smoothly interpolate camera focal length towards the target
        const lerpFactor = 0.05; // Adjust for desired smoothness (0.05 is a good starting point)
        camera.fov = THREE.MathUtils.lerp(camera.fov, cameraFocalLength, lerpFactor);
        camera.updateProjectionMatrix();

        // Calculate camera position based on spherical coordinates
        const fixedCameraDistance = 30; // A fixed distance from the center for orbit
        const verticalAngle = cameraVerticalAngle; // This is the elevation angle from the XZ plane
        const horizontalAngle = cameraRotationY; // This is the angle around the Y-axis (azimuthal)

        // Spherical to Cartesian conversion
        // x = r * cos(phi) * sin(theta)
        // y = r * sin(phi)
        // z = r * cos(phi) * cos(theta)
        // where r = fixedCameraDistance, phi = verticalAngle, theta = horizontalAngle
        const xz_radius = fixedCameraDistance * Math.cos(verticalAngle);
        camera.position.x = xz_radius * Math.sin(horizontalAngle);
        camera.position.y = fixedCameraDistance * Math.sin(verticalAngle);
        camera.position.z = xz_radius * Math.cos(horizontalAngle);

        camera.lookAt(new THREE.Vector3(0, 0, 0)); // Always look at the center
        camera.updateProjectionMatrix();


        const fixedTimeStep = 1 / 60; // seconds
        const maxSubSteps = 10;
        world.step(fixedTimeStep, performance.now() / 1000, maxSubSteps);

        renderer.render(scene, camera);
    }, [cameraFocalLength, cameraVerticalAngle, cameraRotationY]); // cameraFocalLength is now the target, not updated in animate


    // UseEffects to keep refs updated with the latest function instances
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

    // Effects to keep state refs updated
    useEffect(() => {
        gamePhaseRef.current = gamePhase;
    }, [gamePhase]);

    useEffect(() => {
        currentPlayerIdRef.current = currentPlayerId;
    }, [currentPlayerId]);

    useEffect(() => {
        rolledDiceValueRef.current = rolledDiceValue;
    }, [rolledDiceValue]);

    useEffect(() => {
        rollsLeftRef.current = rollsLeft;
    }, [rollsLeft]);


    // Main useEffect for Three.js/Cannon.js setup and initial model loading (runs once)
    useEffect(() => {
        if (!mountRef.current) {
            return;
        }

        // Prevent re-initialization if already set up
        if (rendererRef.current) {
            return;
        }

        // --- Scene Initialization ---
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // --- Camera Initialization ---
        const camera = new THREE.PerspectiveCamera(
            cameraFocalLength, // Use state for initial focal length
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        cameraRef.current = camera;

        // Set initial camera position based on initial state values
        const initialFixedCameraDistance = 30;
        const initialVerticalAngle = cameraVerticalAngle; // Initial angle in radians
        const initialHorizontalAngle = cameraRotationY; // Initial angle in radians

        const initialXzRadius = initialFixedCameraDistance * Math.cos(initialVerticalAngle);
        camera.position.x = initialXzRadius * Math.sin(initialHorizontalAngle);
        camera.position.y = initialFixedCameraDistance * Math.sin(initialVerticalAngle);
        camera.position.z = initialXzRadius * Math.cos(initialHorizontalAngle);

        camera.lookAt(new THREE.Vector3(0, 0, 0));
        camera.updateProjectionMatrix();

        // --- Renderer Initialization ---
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;
        mountRef.current.appendChild(renderer.domElement);

        // --- Lighting ---
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
        const world = new CANNON.World();
        world.gravity.set(0, -9.82, 0); // m/s^2
        world.broadphase = new CANNON.SAPBroadphase(world);
        worldRef.current = world;

        // --- Add a Flat Ground Plane (Three.js Visual) ---
        const groundGeometry = new THREE.PlaneGeometry(50, 50, 10, 10);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            side: THREE.DoubleSide,
        });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        // --- Load GLB Models ---
        const loader = new GLTFLoader();
        let modelsLoadedCount = 0;
        const totalModelsToLoad = 1 + 1 + 4 + (4 * 4); // Center, Grid, 4 Bases, 16 Tokens

        const checkAllModelsLoaded = () => {
            modelsLoadedCount++;
            if (modelsLoadedCount === totalModelsToLoad) {
                setIsLoading(false); // Only set loading to false here
            }
        };

        // Function to create and add a colored cell to the scene (for path visualization)
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

        // Player Colors (Hexadecimal)
        const playerColors = {
            player1: 0xCC1400, // Red
            player2: 0x00CC00, // Green (Inactive for this mode)
            player3: 0x0027CC, // Yellow (Bot)
            player4: 0x6C00CD, // Blue (Inactive for this mode)
        };

        // Player Start Positions (on main path)
        const playerStartPositions: Record<string, [number, number]> = {
            player1: [13, 6],
            player2: [6, 1],
            player3: [1, 8],
            player4: [8, 13],
        };

        // Player Home Paths to the Center (row, col)
        const playerHomePaths: Record<string, [number, number][]> = {
            player1: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // Red
            player2: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], // Green
            player3: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]], // Yellow
            player4: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // Blue
        };

        // Define the top-left corner of each player's 6x6 base area
        const baseStartCoordinates: Record<string, [number, number]> = {
            player1: [9, 0],   // Player 1 (Red)
            player2: [0, 0],   // Player 2 (Green)
            player3: [0, 9],   // Player 3 (Yellow)
            player4: [9, 9],   // Player 4 (Blue)
        };

        // Define the relative 2x2 pattern for tokens within their 6x6 base
        const relative2x2Pattern: [number, number][] = [[2, 2], [2, 3], [3, 2], [3, 3]];


        // --- Load Player Start Base GLB Models (6x6 areas) ---
        const playerStartBaseModelPaths = {
            player1: '/models/p1-start.glb',
            player2: '/models/p2-start.glb',
            player3: '/models/p3-start.glb',
            player4: '/models/p4-start.glb',
        };

        // Load center.glb
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

        // Load grid.glb
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
                checkAllModelsLoaded();
            });
        });

        // Visualize Player Start Positions (these are individual cells for path entry)
        for (const player in playerStartPositions) {
            const [row, col] = playerStartPositions[player as keyof typeof playerStartPositions];
            const color = playerColors[player as keyof typeof playerColors];
            addColoredCell(row, col, color);
        }

        // Visualize Player Home Paths
        for (const player in playerHomePaths) {
            const homePath = playerHomePaths[player as keyof typeof playerHomePaths];
            const color = playerColors[player as keyof typeof playerColors];
            homePath.forEach(([row, col]) => {
                addColoredCell(row, col, color);
            });
        }

        // Prepare initial players state with correct 2x2 token starting positions
        const initialPlayersData: Record<string, Player> = {};
        ['player1', 'player2', 'player3', 'player4'].forEach(id => {
            const [baseStartRow, baseStartCol] = baseStartCoordinates[id];
            const initialTokenStates: TokenState[] = [];
            for (let i = 0; i < 4; i++) {
                const [relativeRow, relativeCol] = relative2x2Pattern[i];
                const gridPos: [number, number] = [baseStartRow + relativeRow, baseStartCol + relativeCol];
                initialTokenStates.push({
                    gridPos: gridPos,
                    pathIndex: -1, // -1 indicates in base
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
                basePositions: initialTokenStates.map(token => token.gridPos), // Store base positions for reference
                homePathMainPathEntryIndex: playerHomePathMainPathEntryIndices[id],
            };
            tokenMeshMapRef.current.set(id, []); // Initialize empty array for meshes in the ref
        });
        setPlayers(initialPlayersData); // Set initial players state here

        // --- Load Player GLB Models (4 instances per player) ---
        const playerModelPaths = {
            player1: '/models/player1.glb',
            player2: '/models/player2.glb',
            player3: '/models/player3.glb',
            player4: '/models/player4.glb',
        };

        // Load one model per player type, then clone it for each token
        Object.entries(playerModelPaths).forEach(([playerId, path]) => {
            loader.load(path, (gltf) => {
                const originalPlayerMesh = gltf.scene;
                originalPlayerMesh.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Clone the mesh for each of the 4 tokens
                for (let i = 0; i < 4; i++) {
                    const clonedMesh = originalPlayerMesh.clone(); // Deep clone

                    // Set initial position based on token state
                    const player = initialPlayersData[playerId];
                    const initialTokenGridPos = player.tokens[i].gridPos;
                    const worldPos = gridToWorld(initialTokenGridPos[0], initialTokenGridPos[1]);
                    clonedMesh.position.set(worldPos.x, 0.5, worldPos.z);
                    clonedMesh.scale.set(0.5, 0.5, 0.5);

                    // Add a unique identifier to the mesh for raycasting
                    clonedMesh.userData = { playerId: playerId, tokenIndex: i };
                    scene.add(clonedMesh);

                    // Store the mesh in the ref, not in React state
                    tokenMeshMapRef.current.get(playerId)?.push(clonedMesh);
                    checkAllModelsLoaded();
                }
            }, undefined, (error) => {
                console.error(`An error occurred while loading ${playerId} GLB model:`, error);
                toast({
                    title: `Error loading ${playerId} model`, description: `Could not load ${playerId} character.`,
                    status: "error", duration: 5000, isClosable: true, position: "top-right",
                });
                // Still call checkAllModelsLoaded to ensure loading state resolves even on error
                for (let i = 0; i < 4; i++) {
                    checkAllModelsLoaded();
                }
            });
        });

        // --- Handle Window Resize ---
        const handleResize = () => {
            if (cameraRef.current && rendererRef.current) {
                cameraRef.current.aspect = window.innerWidth / window.innerHeight;
                cameraRef.current.updateProjectionMatrix();
                rendererRef.current.setSize(window.innerWidth, window.innerHeight);
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);

        // --- Mouse event listeners for token selection ---
        const onMouseMove = (event: MouseEvent) => {
            mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
        };

        const onMouseClick = () => {
            // Use refs to access the latest state values
            if (cameraRef.current && sceneRef.current &&
                gamePhaseRef.current === 'SELECT_TOKEN_TO_MOVE' &&
                currentPlayerIdRef.current === humanPlayerId) {

                if (rolledDiceValueRef.current === null) {
                    console.error("onMouseClick: Dice value is null when trying to move token. This should not happen.");
                    return;
                }

                raycaster.current.setFromCamera(mouse.current, cameraRef.current);
                const intersects = raycaster.current.intersectObjects(sceneRef.current.children, true);

                for (let i = 0; i < intersects.length; i++) {
                    const intersectedObject = intersects[i].object;
                    let currentParent = intersectedObject;
                    while (currentParent && !currentParent.userData.playerId) {
                        currentParent = currentParent.parent;
                    }

                    if (currentParent && currentParent.userData.playerId && currentParent.userData.tokenIndex !== undefined) {
                        const { playerId: clickedPlayerId, tokenIndex: clickedTokenIndex } = currentParent.userData;
                        // Pass the current dice value from the ref to handleTokenClickRef
                        handleTokenClickRef.current?.(clickedPlayerId, clickedTokenIndex);
                        break;
                    }
                }
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('click', onMouseClick);


        // --- Cleanup Function ---
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
            // Dispose of player meshes and bodies (only if they are not shared geometries/materials)
            tokenMeshMapRef.current.forEach(meshes => {
                meshes.forEach(mesh => {
                    scene.remove(mesh);
                    // Dispose of geometry and material if they are unique to this mesh
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
            // Bodies are not explicitly stored in React state, so no need to clean them up here
            // unless they were added to a separate ref like physicsBodiesRef.
        };
    }, []); // Empty dependency array to run only once for setup

    // New useEffect to start animation and render initial frame once loading is complete
    useEffect(() => {
        if (!isLoading && sceneRef.current && cameraRef.current && rendererRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current); // Render initial frame
            animate(); // Start the continuous animation loop
        }
    }, [isLoading, animate]); // Depend on isLoading and animate (which is useCallback)


    // Effect to set up game mode and initial player roles (runs once after loading is complete)
    useEffect(() => {
        if (!isLoading && !hasInitializedGame.current) {
            hasInitializedGame.current = true; // Mark as initialized

            setCurrentPlayerId(playerOrder[0]); // Use the already stable playerOrder
            setGamePhase('ROLL_DICE'); // Start the game phase
            setRollsLeft(3); // Initial rolls for the first player

            // Show welcome toast after initial setup
            let title = "Welcome to Ludo Sync!";
            let description = "Select a game mode from the home page.";
            if (gameMode === "play-with-bot") { // Use the gameMode derived from searchParams at the top
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

            // If the first player is a bot, trigger their roll
            if (playerOrder[0] === botPlayerId) { // Use botPlayerId directly from useMemo
                setTimeout(() => {
                    rollDiceRef.current?.(); // Call via ref
                }, 1500);
            }
        }
    }, [isLoading, searchParams, toast, humanPlayerId, botPlayerId, gameMode, playerOrder, cameraFocalLength, cameraVerticalAngle]);


    // Callback to get the current camera FOV for display in FocalLengthControls
    const getCameraFocalLengthForDisplay = useCallback(() => {
        return cameraRef.current ? cameraRef.current.fov : cameraFocalLength;
    }, [cameraFocalLength]); // Dependency on cameraFocalLength to re-create if initial state changes


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

            {/* Game Info Box (top-left) */}
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

            {/* Roll Dice Button (bottom-right) */}
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

            {/* Camera Vertical Rotation Slider (right side, vertical) */}
            {!isLoading && (
                <Flex
                    position="absolute"
                    top="50%"
                    right="4"
                    transform="translateY(-50%)"
                    zIndex="10"
                    height="250px" // Increased height to accommodate buttons
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
                        onClick={() => setCameraVerticalAngle(prev => Math.min(prev + 0.01, Math.PI / 2))} // Max 90 degrees
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

            {/* Camera Horizontal Rotation Slider (bottom center, horizontal) */}
            {!isLoading && (
                <Flex
                    position="absolute"
                    bottom="4"
                    left="50%"
                    transform="translateX(-50%)"
                    zIndex="10"
                    width="350px" // Increased width to accommodate buttons
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

            {/* Focal Length Controls (bottom-left) */}
            {!isLoading && (
                <FocalLengthControls
                    getFocalLength={getCameraFocalLengthForDisplay} // Pass the getter function
                    onIncrease={() => setCameraFocalLength(prev => Math.min(prev + 5, 80))} // Increasing FOV zooms OUT
                    onDecrease={() => setCameraFocalLength(prev => Math.max(prev - 5, 10))} // Decreasing FOV zooms IN
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
                    {/* You could add a "Play Again" button here */}
                </Center>
            )}
        </Box>
    );
}
