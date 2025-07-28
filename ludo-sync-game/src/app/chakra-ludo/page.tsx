"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
    Box,
    Spinner,
    Center,
    Text,
    Button,
    Flex,
    Grid,
    Circle,
    VStack,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalCloseButton,
    IconButton,
    useBreakpointValue,
} from "@chakra-ui/react";
import { InfoIcon, QuestionIcon } from '@chakra-ui/icons'; // Import QuestionIcon for the help button
import { useSearchParams } from "next/navigation";
import { keyframes } from "@chakra-ui/system";
import DiceAnimation from "@/components/DiceAnimation";


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
    color: string; // Chakra color string
    startPosition: [number, number];
    homePath: [number, number][];
    basePositions: [number, number][];
    homePathMainPathEntryIndex: number;
}

// Updated GamePhase type to include ANIMATING_DICE
type GamePhase = 'IDLE' | 'ROLL_DICE' | 'SELECT_TOKEN_TO_MOVE' | 'ANIMATING_MOVE' | 'ANIMATING_DICE' | 'GAME_OVER';
type HopType = 'normal' | 'joyful' | 'frustrated' | 'fast';

const BOARD_SIZE = 15;

// Keyframe animations for different hop types
const normalHopAnimation = keyframes`
  0% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0); }
`;

const joyfulHopAnimation = keyframes`
  0% { transform: translateY(0); }
  25% { transform: translateY(-20px) rotate(5deg); }
  50% { transform: translateY(0) rotate(-5deg); }
  75% { transform: translateY(-10px) rotate(2deg); }
  100% { transform: translateY(0); }
`;

const frustratedHopAnimation = keyframes`
  0% { transform: translateY(0) translateX(0); }
  25% { transform: translateY(-5px) translateX(-3px); }
  50% { transform: translateY(0) translateX(0); }
  75% { transform: translateY(-5px) translateX(3px); }
  100% { transform: translateY(0) translateX(0); }
`;

const fastHopAnimation = keyframes`
  0% { transform: translateY(0); }
  50% { transform: translateY(-15px); }
  100% { transform: translateY(0); }
`;


export default function LudoPageContent() {
    // Removed useToast
    const searchParams = useSearchParams();

    const [isLoading, setIsLoading] = useState(true);
    const [gamePhase, setGamePhase] = useState<GamePhase>('IDLE');
    const [currentPlayerId, setCurrentPlayerId] = useState<string>('player1');
    const [rolledDiceValue, setRolledDiceValue] = useState<number | null>(null);
    const [players, setPlayers] = useState<Record<string, Player>>({});
    const [playerOrder, setPlayerOrder] = useState<string[]>([]); // Dynamically set based on player count
    const [winner, setWinner] = useState<string | null>(null);
    const [rollsLeft, setRollsLeft] = useState<number>(1);
    const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null); // For highlighting selected token
    const [hoppingToken, setHoppingToken] = useState<{ playerId: string; tokenIndex: number; hopType: HopType } | null>(null); // State for hopping animation
    const [diceRollHistory, setDiceRollHistory] = useState<number[]>([]); // To track recent dice rolls for frustration
    const [isDiceAnimating, setIsDiceAnimating] = useState(false); // New state for dice animation

    // New states for player selection
    const [numPlayers, setNumPlayers] = useState<number | null>(null);
    const [isGameStarted, setIsGameStarted] = useState(false);

    // State for logs and modal
    const [gameLogs, setGameLogs] = useState<string[]>([]);
    const [showLogsModal, setShowLogsModal] = useState(false);
    // New state for help modal
    const [showHelpModal, setShowHelpModal] = useState(false);
    // New state for displaying the previous dice value
    const [previousDiceDisplayValue, setPreviousDiceDisplayValue] = useState<number | null>(null);


    const addLog = useCallback((logMessage: string) => {
        setGameLogs(prevLogs => [logMessage, ...prevLogs]);
    }, []);

    const playersRef = useRef(players);
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const gameMode = searchParams.get('mode') as 'play-with-bot' | 'local-friends' | 'multiplayer' || null;

    const { humanPlayerId, botPlayerId } = useMemo(() => {
        let derivedHumanPlayerId: string | null = null;
        let derivedBotId: string | null = null;

        if (gameMode === 'play-with-bot') {
            derivedHumanPlayerId = 'player1';
            derivedBotId = 'player3'; // Assuming player3 is always the bot in bot mode
        } else if (gameMode === 'local-friends') {
            derivedHumanPlayerId = 'player1'; // First human player for local mode
            derivedBotId = null; // No bot in local friends mode
        } else if (gameMode === 'multiplayer') {
            derivedHumanPlayerId = 'player1';
            derivedBotId = 'player3'; // Assuming player3 is always the bot in multiplayer
        }
        return { humanPlayerId: derivedHumanPlayerId, botPlayerId: derivedBotId };
    }, [gameMode]);

    const hasInitializedGame = useRef(false);

    const rollDiceRef = useRef<(() => void) | null>(null);
    const endTurnRef = useRef<(() => void) | null>(null);
    const makeBotMoveRef = useRef<((diceValue: number, movableTokens: number[]) => void) | null>(null);
    const moveTokenRef = useRef<((playerId: string, tokenIndex: number, diceValue: number) => void) | null>(null);
    const handleTokenClickRef = useRef<((playerId: string, tokenIndex: number) => void) | null>(null);

    const gamePhaseRef = useRef<GamePhase>('IDLE');
    const currentPlayerIdRef = useRef<string>('player1');
    const rolledDiceValueRef = useRef<number | null>(null);
    const rollsLeftRef = useRef<number>(1);

    useEffect(() => { gamePhaseRef.current = gamePhase; }, [gamePhase]);
    useEffect(() => { currentPlayerIdRef.current = currentPlayerId; }, [currentPlayerId]);
    useEffect(() => { rolledDiceValueRef.current = rolledDiceValue; }, [rolledDiceValue]);
    useEffect(() => { rollsLeftRef.current = rollsLeft; }, [rollsLeft]);

    // Ludo Board Path Coordinates (main path, clockwise from player1's start)
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

    // Player specific home paths (colored paths leading to center)
    const playerHomePaths: Record<string, [number, number][]> = useMemo(() => ({
        player1: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // Red
        player2: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], // Green
        player3: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]], // Blue
        player4: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // Purple
    }), []);

    // Entry point index into main path before entering home path
    const playerHomePathMainPathEntryIndices: Record<string, number> = useMemo(() => ({
        player1: 51,
        player2: 12,
        player3: 25,
        player4: 38,
    }), []);

    // Safe spots (marked with a star in traditional Ludo)
    const safeSpots: Set<string> = useMemo(() => new Set([
        JSON.stringify([13, 6]), // P1 start
        JSON.stringify([6, 1]),  // P2 start
        JSON.stringify([1, 8]),  // P3 start
        JSON.stringify([8, 13]), // P4 start
        // Additional safe spots on the main path
        JSON.stringify([8, 0]),
        JSON.stringify([0, 6]),
        JSON.stringify([6, 14]),
        JSON.stringify([14, 8]),
    ]), []);

    // Base areas for each player
    const baseStartCoordinates: Record<string, [number, number]> = useMemo(() => ({
        player1: [9, 0], // Red base (top-left of its 2x2 grid)
        player2: [0, 0], // Green base
        player3: [0, 9], // Blue base
        player4: [9, 9], // Purple base
    }), []);

    // Relative positions for tokens within a 2x2 base grid
    const relative2x2Pattern: [number, number][] = useMemo(() => [[2, 2], [2, 3], [3, 2], [3, 3]], []);

    // Player start positions on the main path
    const playerStartPositions: Record<string, [number, number]> = useMemo(() => ({
        player1: [13, 6],
        player2: [6, 1],
        player3: [1, 8],
        player4: [8, 13],
    }), []);


    // Helper to determine cell type for styling
    const getCellType = useCallback((row: number, col: number) => {
        // Center square
        if (row >= 6 && row <= 8 && col >= 6 && col <= 8 && !(row === 7 && col === 7)) {
            // Home triangles (inner part of home path)
            if (row === 7) { // Horizontal home path cells
                if (col < 7) return 'homePathGreen'; // Player 2's home path
                if (col > 7) return 'homePathPurple'; // Player 4's home path
            } else if (col === 7) { // Vertical home path cells
                if (row < 7) return 'homePathBlue'; // Player 3's home path
                if (row > 7) return 'homePathRed'; // Player 1's home path
            }
        }
        if (row === 7 && col === 7) return 'center';

        // Bases
        if (row >= 9 && row <= 14 && col >= 0 && col <= 5) return 'baseRed';
        if (row >= 0 && row <= 5 && col >= 0 && col <= 5) return 'baseGreen';
        if (row >= 0 && row <= 5 && col >= 9 && col <= 14) return 'baseBlue';
        if (row >= 9 && row <= 14 && col >= 9 && col <= 14) return 'basePurple';

        // Main path cells
        const isMainPath = pathCoordinates.some(coord => coord[0] === row && coord[1] === col);
        if (isMainPath) {
            // Check if it's a player's start cell
            if (row === 13 && col === 6) return 'startRed';
            if (row === 6 && col === 1) return 'startGreen';
            if (row === 1 && col === 8) return 'startBlue';
            if (row === 8 && col === 13) return 'startPurple';

            // Check if it's a general safe spot
            if (safeSpots.has(JSON.stringify([row, col]))) return 'safeSpot';

            return 'mainPath';
        }

        // Home paths (outer part)
        const isHomePathRed = playerHomePaths.player1.some(coord => coord[0] === row && coord[1] === col);
        if (isHomePathRed) return 'homePathRed';
        const isHomePathGreen = playerHomePaths.player2.some(coord => coord[0] === row && coord[1] === col);
        if (isHomePathGreen) return 'homePathGreen';
        const isHomePathBlue = playerHomePaths.player3.some(coord => coord[0] === row && coord[1] === col);
        if (isHomePathBlue) return 'homePathBlue';
        const isHomePathPurple = playerHomePaths.player4.some(coord => coord[0] === row && coord[1] === col);
        if (isHomePathPurple) return 'homePathPurple';

        return 'empty'; // Empty cells outside the board structure
    }, [pathCoordinates, playerHomePaths, safeSpots]);

    // Function to calculate next token position (single step for animation or final state)
    const calculateNextPosition = useCallback((
        tokenState: TokenState,
        steps: number, // Total steps to consider for the final position
        playerId: string
    ): TokenState | null => {
        const player = playersRef.current[playerId];
        if (!player) {
            return null;
        }

        if (tokenState.isInBase) {
            if (steps === 6) {
                // If in base and rolling a 6, the token moves to its start position.
                // The '6' is consumed just to get out.
                const newPathIndex = pathCoordinates.findIndex(p => p[0] === player.startPosition[0] && p[1] === player.startPosition[1]);
                if (newPathIndex === -1) return null; // Should not happen if start position is valid
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
                return { gridPos: [-1, -1], pathIndex: -2, isInBase: false, isInHomePath: false, isHome: true }; // -1,-1 for home
            } else {
                return null; // Overshot home
            }
        } else {
            // Moving on main path
            const currentMainPathIndex = tokenState.pathIndex;
            const targetMainPathIndex = currentMainPathIndex + steps;

            // Check if token enters home path
            if (currentMainPathIndex <= player.homePathMainPathEntryIndex && targetMainPathIndex > player.homePathMainPathEntryIndex) {
                const stepsIntoHomePath = targetMainPathIndex - player.homePathMainPathEntryIndex - 1;
                if (stepsIntoHomePath < player.homePath.length) {
                    return { gridPos: player.homePath[stepsIntoHomePath], pathIndex: stepsIntoHomePath, isInBase: false, isInHomePath: true, isHome: false };
                } else if (stepsIntoHomePath === player.homePath.length) {
                    return { gridPos: [-1, -1], pathIndex: -2, isInBase: false, isInHomePath: false, isHome: true }; // -1,-1 for home
                } else {
                    return null; // Overshot home
                }
            } else {
                const newPathIndex = targetMainPathIndex % pathCoordinates.length;
                const newGridPos = pathCoordinates[newPathIndex];
                return { gridPos: newGridPos, pathIndex: newPathIndex, isInBase: false, isInHomePath: false, isHome: false };
            }
        }
    }, [pathCoordinates, playerHomePaths]);

    const getMovableTokens = useCallback((playerId: string, diceValue: number): number[] => {
        const movableTokenIndices: number[] = [];
        const player = playersRef.current[playerId];

        if (!player) {
            return [];
        }

        player.tokens.forEach((token, index) => {
            if (token.isHome) {
                return;
            }
            // Temporarily use the full diceValue to check if a move is possible
            const potentialNextState = calculateNextPosition(token, diceValue, playerId);
            if (potentialNextState) {
                movableTokenIndices.push(index);
            }
        });
        return movableTokenIndices;
    }, [calculateNextPosition]);

    const checkWinCondition = useCallback(() => {
        const currentPlayers = playersRef.current;
        for (const playerId of playerOrder) {
            const player = currentPlayers[playerId];
            if (!player) {
                continue;
            }
            const tokensInHome = player.tokens.filter(token => token.isHome).length;
            if (tokensInHome === 4) {
                setWinner(playerId);
                setGamePhase('GAME_OVER');
                const winMessage = `${playerId.replace('player', 'Player ')} wins the game!`;
                // Removed toast
                addLog(`GAME OVER: ${winMessage}`);
                break;
            }
        }
    }, [playerOrder, addLog]);

    const endTurn = useCallback(() => {
        // Removed setRolledDiceValue(null); // Keep the last rolled value visible
        setRollsLeft(1);
        setSelectedTokenIndex(null); // Clear selected token
        setDiceRollHistory([]); // Reset dice history on turn end
        // Set isDiceAnimating to false when the turn ends to ensure the button is re-enabled
        setIsDiceAnimating(false);

        const currentIndex = playerOrder.indexOf(currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerOrder.length;
        const nextPlayer = playerOrder[nextIndex];

        setCurrentPlayerId(nextPlayer);
        setGamePhase('ROLL_DICE');
        addLog(`Turn ends for ${currentPlayerId.replace('player', 'Player ')}. Next turn: ${nextPlayer.replace('player', 'Player ')}`);

        // If the next player is a bot, trigger their roll after a delay
        if (nextPlayer === botPlayerId) {
            setTimeout(() => {
                rollDiceRef.current?.();
            }, 1500);
        }
    }, [currentPlayerId, playerOrder, botPlayerId, addLog]);

    // New callback function to handle logic after dice animation ends
    const handleDiceAnimationEnd = useCallback(() => {
        setIsDiceAnimating(false); // Fix: Ensure dice button is re-enabled immediately after animation callback fires

        // Now, proceed with the game logic that depends on the dice roll
        const diceResult = rolledDiceValueRef.current; // Use ref to get the latest value
        const currentPlayer = currentPlayerIdRef.current;

        if (diceResult === null) {
            console.error("Dice animation ended but rolledDiceValue is null.");
            setGamePhase('ROLL_DICE'); // Reset to roll dice phase
            return;
        }

        // Set the value for the persistent previous dice display
        setPreviousDiceDisplayValue(diceResult);

        const movableTokens = getMovableTokens(currentPlayer, diceResult);

        if (diceResult === 6) {
            setRollsLeft(prev => prev + 1);
            if (movableTokens.length > 0) {
                setGamePhase('SELECT_TOKEN_TO_MOVE');
                addLog(`Player ${currentPlayer.replace('player', 'Player ')} can move a token. A 6 was rolled, granting another turn.`);
                if (currentPlayer === botPlayerId) {
                    setTimeout(() => {
                        makeBotMoveRef.current?.(diceResult, movableTokens);
                    }, 1000);
                }
            } else {
                addLog(`Player ${currentPlayer.replace('player', 'Player ')} rolled a 6 but has no movable tokens. Gets another turn.`);
                setTimeout(() => rollDiceRef.current?.(), 1500);
            }
        } else {
            if (movableTokens.length > 0) {
                setGamePhase('SELECT_TOKEN_TO_MOVE');
                setRollsLeft(prev => prev - 1);
                addLog(`Player ${currentPlayer.replace('player', 'Player ')} can move a token.`);
                if (currentPlayer === botPlayerId) {
                    setTimeout(() => {
                        makeBotMoveRef.current?.(diceResult, movableTokens);
                    }, 1000);
                }
            } else {
                if (rollsLeftRef.current > 1) {
                    setRollsLeft(prev => prev - 1);
                    addLog(`Player ${currentPlayer.replace('player', 'Player ')} has no possible moves. ${rollsLeftRef.current - 1} rolls left.`);
                    setTimeout(() => rollDiceRef.current?.(), 1500);
                } else {
                    addLog(`Player ${currentPlayer.replace('player', 'Player ')} has no possible moves. Turn passes.`);
                    setTimeout(() => endTurnRef.current?.(), 1500);
                }
            }
        }
    }, [botPlayerId, getMovableTokens, addLog]);

    const rollDice = useCallback(() => {
        if (gamePhaseRef.current !== 'ROLL_DICE' || winner) {
            return;
        }

        // Clear the previous dice display when a new roll starts
        setPreviousDiceDisplayValue(null);

        // Hide the previously rolled dice before starting a new animation
        setIsDiceAnimating(false); // This will unmount the previous DiceAnimation component

        const diceResult = Math.floor(Math.random() * 6) + 1;
        setRolledDiceValue(diceResult);
        setIsDiceAnimating(true); // Start dice animation for the new roll
        setGamePhase('ANIMATING_DICE'); // Change phase to indicate dice animation is active

        addLog(`${currentPlayerIdRef.current.replace('player', 'Player ')} rolled a ${diceResult}.`);
        // Update dice roll history
        setDiceRollHistory(prevHistory => [...prevHistory, diceResult].slice(-3));

        // The rest of the game logic after dice roll will now be handled in handleDiceAnimationEnd
        // after the animation completes.
    }, [winner, addLog]);

    // Helper to generate the full path for animation, step by step
    const generateAnimationPath = useCallback((initialTokenState: TokenState, stepsToMove: number, currentPlayerId: string): [number, number][] => {
        const path: [number, number][] = [];
        let currentSimulatedState = { ...initialTokenState };
        const player = playersRef.current[currentPlayerId];

        // Special handling for moving out of base with a 6
        if (initialTokenState.isInBase && stepsToMove === 6) {
            const startPosIndex = pathCoordinates.findIndex(p => p[0] === player.startPosition[0] && p[1] === player.startPosition[1]);
            if (startPosIndex !== -1) {
                path.push(player.startPosition);
                // After getting out of base, no further movement occurs in this turn with the same '6'.
                // So, stepsToMove is effectively 0 for path generation.
                return path;
            }
        }

        // Simulate remaining steps one by one if not coming out of base or if already on path
        for (let i = 0; i < stepsToMove; i++) {
            // Calculate a single step from the current simulated state
            let nextStepSimulatedState;
            if (currentSimulatedState.isInHomePath) {
                const currentHomePathIndex = player.homePath.findIndex(p => p[0] === currentSimulatedState.gridPos[0] && p[1] === currentSimulatedState.gridPos[1]);
                if (currentHomePathIndex + 1 < player.homePath.length) {
                    nextStepSimulatedState = {
                        gridPos: player.homePath[currentHomePathIndex + 1],
                        pathIndex: currentHomePathIndex + 1,
                        isInBase: false,
                        isInHomePath: true,
                        isHome: false,
                    };
                } else if (currentHomePathIndex + 1 === player.homePath.length) {
                    nextStepSimulatedState = { gridPos: [-1, -1], pathIndex: -2, isInBase: false, isInHomePath: false, isHome: true };
                } else {
                    nextStepSimulatedState = null; // Overshot home
                }
            } else { // On main path
                const nextMainPathIndex = (currentSimulatedState.pathIndex + 1) % pathCoordinates.length;
                const nextMainGridPos = pathCoordinates[nextMainPathIndex];

                // Check for entry into home path
                if (currentSimulatedState.pathIndex <= player.homePathMainPathEntryIndex && nextMainPathIndex === (player.homePathMainPathEntryIndex + 1) % pathCoordinates.length) {
                    // This is the step immediately after the entry point, leading into home path index 0
                    nextStepSimulatedState = { gridPos: player.homePath[0], pathIndex: 0, isInBase: false, isInHomePath: true, isHome: false };
                } else {
                    nextStepSimulatedState = { gridPos: nextMainGridPos, pathIndex: nextMainPathIndex, isInBase: false, isInHomePath: false, isHome: false };
                }
            }


            if (nextStepSimulatedState) {
                path.push(nextStepSimulatedState.gridPos);
                currentSimulatedState = nextStepSimulatedState;
                if (nextStepSimulatedState.isHome) {
                    break; // Stop if home is reached
                }
            } else {
                console.warn("Path generation encountered an invalid step (overshot or logic error).");
                break;
            }
        }
        return path;
    }, [pathCoordinates, playerHomePaths]);


    const moveToken = useCallback((playerId: string, tokenIndex: number, diceValue: number) => {
        const player = playersRef.current[playerId];
        if (!player || tokenIndex < 0 || tokenIndex >= player.tokens.length) {
            return;
        }

        const currentTokenState = player.tokens[tokenIndex];

        // Determine if this move is specifically to get out of base with a 6
        const isMovingOutOfBaseWithSix = currentTokenState.isInBase && diceValue === 6;

        // Calculate the *final* potential state for game logic after animation.
        // For 'getting out of base', the final state is just the start position,
        // not 6 steps along the path.
        let finalTargetState: TokenState | null;
        if (isMovingOutOfBaseWithSix) {
            const newPathIndex = pathCoordinates.findIndex(p => p[0] === player.startPosition[0] && p[1] === player.startPosition[1]);
            finalTargetState = { gridPos: player.startPosition, pathIndex: newPathIndex, isInBase: false, isInHomePath: false, isHome: false };
        } else {
            finalTargetState = calculateNextPosition(currentTokenState, diceValue, playerId);
        }

        if (!finalTargetState) {
            // Removed toast
            setGamePhase('SELECT_TOKEN_TO_MOVE'); // Allow player to select another token if invalid
            return;
        }

        setGamePhase('ANIMATING_MOVE');
        addLog(`${playerId.replace('player', 'Player ')} is moving token ${tokenIndex + 1} with a roll of ${diceValue}.`);

        let capturedTokenInfo: { playerId: string; tokenIndex: number; originalBasePos: [number, number]; } | null = null;
        const isTargetSafeSpot = safeSpots.has(JSON.stringify(finalTargetState.gridPos));

        // Determine capture *before* animation starts, but apply *after* animation
        if (!finalTargetState.isHome && !isMovingOutOfBaseWithSix) { // No capture if just moving out of base
            for (const opponentId of playerOrder) {
                const opponentPlayer = playersRef.current[opponentId];
                if (!opponentPlayer) continue;
                if (opponentId === playerId) continue;

                for (let oppIndex = 0; oppIndex < opponentPlayer.tokens.length; oppIndex++) {
                    const opponentToken = opponentPlayer.tokens[oppIndex];
                    if (!opponentToken.isInBase && !opponentToken.isHome &&
                        opponentToken.gridPos[0] === finalTargetState.gridPos[0] &&
                        opponentToken.gridPos[1] === finalTargetState.gridPos[1]) {

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

        // The animation path for getting out of base is just the start position
        const fullAnimationGridPath = isMovingOutOfBaseWithSix
            ? [player.startPosition]
            : generateAnimationPath(currentTokenState, diceValue, playerId);

        let currentPathStep = 0;

        const animateStep = () => {
            if (currentPathStep >= fullAnimationGridPath.length) {
                // All steps animated, apply final state and clean up
                setHoppingToken(null);
                setSelectedTokenIndex(null); // Clear selected token highlight

                // Apply the precise final state to the token
                setPlayers(prevPlayers => {
                    const finalPlayers = { ...prevPlayers };
                    finalPlayers[playerId] = {
                        ...finalPlayers[playerId],
                        tokens: finalPlayers[playerId].tokens.map((token, idx) =>
                            idx === tokenIndex ? finalTargetState : token // Apply the precise final state
                        ),
                    };

                    // Apply capture visually by resetting opponent token
                    if (capturedTokenInfo) {
                        const { playerId: capturedPId, tokenIndex: capturedTIdx, originalBasePos } = capturedTokenInfo;
                        finalPlayers[capturedPId] = {
                            ...finalPlayers[capturedPId],
                            tokens: finalPlayers[capturedPId].tokens.map((token, idx) =>
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
                    return finalPlayers;
                });

                // Post-animation game logic
                if (capturedTokenInfo) {
                    addLog(`${playerId.replace('player', 'Player ')} captured ${capturedTokenInfo.playerId.replace('player', 'Player ')}'s token ${capturedTokenInfo.tokenIndex + 1}!`);
                    // Removed toast
                }
                if (finalTargetState.isHome) {
                    addLog(`${playerId.replace('player', 'Player ')}'s token ${tokenIndex + 1} reached home.`);
                    // Removed toast
                }

                checkWinCondition();

                // Corrected logic: If a 6 was rolled OR a token was captured, the player gets another turn.
                // Otherwise, consume a roll opportunity.
                setRollsLeft(prevRolls => {
                    let newRolls = prevRolls;
                    if (diceValue === 6 || capturedTokenInfo) {
                        newRolls = prevRolls; // Keep current rollsLeft, essentially granting another turn
                    } else {
                        newRolls = prevRolls - 1; // Consume a roll
                    }

                    if (newRolls > 0) {
                        addLog(`${playerId.replace('player', 'Player ')} has ${newRolls} rolls left. Rolling again.`);
                        setTimeout(() => {
                            setGamePhase('ROLL_DICE');
                            if (currentPlayerIdRef.current === botPlayerId) {
                                rollDiceRef.current?.();
                            }
                        }, 500);
                    } else {
                        addLog(`${playerId.replace('player', 'Player ')} has no rolls left. Turn passes.`);
                        setTimeout(() => endTurnRef.current?.(), 500);
                    }
                    return newRolls;
                });
                return;
            }

            const targetGridPos = fullAnimationGridPath[currentPathStep];

            // Determine hop type for this step
            let hopType: HopType = 'normal';
            // Check if the current step is the final step and a capture is happening
            if (capturedTokenInfo && currentPathStep === fullAnimationGridPath.length - 1) {
                hopType = 'joyful';
            } else if (diceRollHistory.length >= 3 && diceRollHistory.every(roll => roll <= 2)) { // Frustrated if last 3 rolls are low
                hopType = 'frustrated';
            } else if (diceValue >= 5) { // Fast for high rolls
                hopType = 'fast';
            }

            // Update the token's position in state for the current step
            setPlayers(prevPlayers => {
                const newPlayers = { ...prevPlayers };
                newPlayers[playerId] = {
                    ...newPlayers[playerId],
                    tokens: newPlayers[playerId].tokens.map((token, idx) =>
                        idx === tokenIndex ? { ...token, gridPos: targetGridPos } : token
                    ),
                };
                return newPlayers;
            });

            // Trigger the hop animation for the token at its new position
            setHoppingToken({ playerId, tokenIndex, hopType });

            // Wait for the hop animation to complete, then move to the next step
            setTimeout(() => {
                setHoppingToken(null); // Clear hop after animation duration
                currentPathStep++;
                animateStep(); // Recursively call for the next step
            }, 350); // Duration slightly longer than hopAnimation (0.3s)
        };

        // Start the animation sequence
        animateStep();

    }, [calculateNextPosition, safeSpots, playerOrder, botPlayerId, checkWinCondition, addLog, generateAnimationPath, diceRollHistory, pathCoordinates]);

    const makeBotMove = useCallback((diceValue: number, movableTokens: number[]) => {
        const botPlayer = playersRef.current[currentPlayerIdRef.current];
        if (!botPlayer || movableTokens.length === 0) {
            // If no movable tokens, do not immediately end turn here.
            // Let rollDice or moveToken's post-animation logic handle the turn progression
            // based on whether a 6 was rolled and if rollsLeft are available.
            return; // Simply return, don't force endTurn
        }

        let chosenTokenIndex: number | null = null;

        // Strategy 1: If 6 is rolled, try to get a token out of base
        if (diceValue === 6) {
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                if (token.isInBase) {
                    chosenTokenIndex = index;
                    addLog(`Bot (${currentPlayerIdRef.current.replace('player', 'Player ')})_chooses to move token ${index + 1} from base with a 6.`);
                    break;
                }
            }
        }

        // Strategy 2: Try to capture an opponent's token
        if (chosenTokenIndex === null) {
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                const potentialNextState = calculateNextPosition(token, diceValue, currentPlayerIdRef.current);
                if (!potentialNextState || potentialNextState.isHome) continue;

                const isTargetSafeSpot = safeSpots.has(JSON.stringify(potentialNextState.gridPos));
                if (isTargetSafeSpot) continue;

                for (const opponentId of playerOrder) {
                    if (opponentId === currentPlayerIdRef.current) continue;
                    const opponentPlayer = playersRef.current[opponentId];
                    if (!opponentPlayer) continue;

                    for (const oppToken of opponentPlayer.tokens) {
                        if (!oppToken.isInBase && !oppToken.isHome &&
                            oppToken.gridPos[0] === potentialNextState.gridPos[0] &&
                            oppToken.gridPos[1] === potentialNextState.gridPos[1]) {
                            chosenTokenIndex = index;
                            addLog(`Bot (${currentPlayerIdRef.current.replace('player', 'Player ')}): chooses to capture opponent's token with token ${index + 1}.`);
                            break;
                        }
                    }
                    if (chosenTokenIndex !== null) break;
                }
                if (chosenTokenIndex !== null) break;
            }
        }

        // Strategy 3: Move the token closest to home or furthest on the board
        if (chosenTokenIndex === null) {
            let maxDistance = -1;
            for (const index of movableTokens) {
                const token = botPlayer.tokens[index];
                const potentialNextState = calculateNextPosition(token, diceValue, currentPlayerIdRef.current);
                if (!potentialNextState) continue;

                let currentDistance = 0;
                if (potentialNextState.isHome) {
                    currentDistance = Infinity; // Prioritize getting home
                } else if (potentialNextState.isInHomePath) {
                    currentDistance = pathCoordinates.length + potentialNextState.pathIndex; // Home path positions
                } else {
                    currentDistance = potentialNextState.pathIndex; // Main path positions
                }

                if (currentDistance > maxDistance) {
                    maxDistance = currentDistance;
                    chosenTokenIndex = index;
                }
            }
            if (chosenTokenIndex !== null) {
                addLog(`Bot (${currentPlayerIdRef.current.replace('player', 'Player ')}): chooses token ${chosenTokenIndex + 1} to move furthest.`);
            }
        }

        // Fallback: Just pick the first movable token
        if (chosenTokenIndex === null && movableTokens.length > 0) {
            chosenTokenIndex = movableTokens[0];
            addLog(`Bot (${currentPlayerIdRef.current.replace('player', 'Player ')}): picks default token ${chosenTokenIndex + 1}.`);
        }

        if (chosenTokenIndex !== null) {
            moveTokenRef.current?.(currentPlayerIdRef.current, chosenTokenIndex, diceValue);
        } else {
            // This case means bot has movable tokens but its strategy couldn't pick one,
            // or there were no movable tokens from the start.
            // In both scenarios, the turn logic (rollsLeft) should be handled by rollDice/moveToken post-animation.
            // DO NOT call endTurnRef.current?.() here directly.
            addLog(`Bot (${currentPlayerIdRef.current.replace('player', 'Player ')}): has no valid moves according to strategy. Turn progression handled by main game loop.`);
        }
    }, [calculateNextPosition, playerOrder, safeSpots, pathCoordinates, addLog]);

    const handleTokenClick = useCallback((playerId: string, tokenIndex: number) => {
        if (gamePhaseRef.current === 'SELECT_TOKEN_TO_MOVE' && currentPlayerIdRef.current === playerId && playerId === humanPlayerId) {
            if (rolledDiceValueRef.current === null) {
                return;
            }
            const movableTokens = getMovableTokens(playerId, rolledDiceValueRef.current);
            if (movableTokens.includes(tokenIndex)) {
                addLog(`${playerId.replace('player', 'Player ')} clicked token ${tokenIndex + 1} to move.`);
                setSelectedTokenIndex(tokenIndex); // Highlight selected token
                moveTokenRef.current?.(playerId, tokenIndex, rolledDiceValueRef.current);
            } else {
                addLog(`Invalid move: ${playerId.replace('player', 'Player ')} tried to move token ${tokenIndex + 1} but it's not a valid move.`);
                // Removed toast
            }
        }
    }, [humanPlayerId, getMovableTokens, addLog]);

    // Initialize refs
    useEffect(() => { rollDiceRef.current = rollDice; }, [rollDice]);
    useEffect(() => { endTurnRef.current = endTurn; }, [endTurn]);
    useEffect(() => { makeBotMoveRef.current = makeBotMove; }, [makeBotMove]);
    useEffect(() => { moveTokenRef.current = moveToken; }, [moveToken]);
    useEffect(() => { handleTokenClickRef.current = handleTokenClick; }, [handleTokenClick]);

    // Initial game setup
    useEffect(() => {
        if (hasInitializedGame.current) {
            return; // Already initialized
        }

        // If gameMode is 'play-with-bot', we bypass the player selection screen
        if (gameMode === 'play-with-bot') {
            hasInitializedGame.current = true; // Mark as initialized
            const activePlayerIds = ['player1', 'player3']; // P1 is human, P3 is bot
            setNumPlayers(2); // Set numPlayers for consistency
            setPlayerOrder(activePlayerIds);

            const initialPlayersData: Record<string, Player> = {};
            const playerColors = {
                player1: 'red.500',
                player2: 'green.500',
                player3: 'blue.500',
                player4: 'purple.500',
            };

            activePlayerIds.forEach(id => {
                const [baseStartRow, baseStartCol] = baseStartCoordinates[id];
                const initialTokenStates: TokenState[] = [];
                for (let i = 0; i < 4; i++) {
                    const [relativeRow, relativeCol] = relative2x2Pattern[i];
                    const gridPos: [number, number] = [baseStartRow + relativeRow, baseStartCol + relativeCol];
                    initialTokenStates.push({
                        gridPos: gridPos,
                        pathIndex: -1, // -1 means in base
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
            });
            setPlayers(initialPlayersData);
            setCurrentPlayerId(activePlayerIds[0]);
            setGamePhase('ROLL_DICE');
            setRollsLeft(1);
            setIsLoading(false);
            setIsGameStarted(true); // Game is now started

            // Removed toast
            addLog("Game Mode: Bot Only. Player 1 (human) vs Player 3 (bot).");

            if (activePlayerIds[0] === botPlayerId) {
                setTimeout(() => {
                    rollDiceRef.current?.();
                }, 1500);
            }
        } else if (numPlayers !== null && !isGameStarted) {
            // This block runs if gameMode is NOT 'play-with-bot' AND numPlayers has been selected by user
            hasInitializedGame.current = true; // Mark as initialized
            let activePlayerIds: string[] = [];
            if (numPlayers === 2) {
                activePlayerIds = ['player1', 'player3'];
            } else if (numPlayers === 3) {
                activePlayerIds = ['player1', 'player2', 'player3'];
            } else if (numPlayers === 4) {
                activePlayerIds = ['player1', 'player2', 'player3', 'player4'];
            }
            setPlayerOrder(activePlayerIds);

            const initialPlayersData: Record<string, Player> = {};
            const playerColors = {
                player1: 'red.500',
                player2: 'green.500',
                player3: 'blue.500',
                player4: 'purple.500',
            };

            activePlayerIds.forEach(id => {
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
            });
            setPlayers(initialPlayersData);
            setCurrentPlayerId(activePlayerIds[0]);
            setGamePhase('ROLL_DICE');
            setRollsLeft(1);
            setIsLoading(false);
            setIsGameStarted(true);

            // Removed toast
            addLog(`Game Mode: Local Friends. Playing with ${numPlayers} human players.`);

            if (activePlayerIds[0] === botPlayerId) { // This check is for multiplayer mode if botPlayerId is not null
                setTimeout(() => {
                    rollDiceRef.current?.();
                }, 1500);
            }
        } else if (numPlayers === null && !isGameStarted) {
            // This block runs initially if gameMode is NOT 'play-with-bot'
            setIsLoading(false); // Stop loading, show selection screen
        }
    }, [gameMode, numPlayers, isGameStarted, humanPlayerId, botPlayerId, addLog, baseStartCoordinates, relative2x2Pattern, playerStartPositions, playerHomePaths, playerHomePathMainPathEntryIndices]);

    // Responsive cell size
    const responsiveCellSize = useBreakpointValue({
        base: '20px', // Smaller for mobile
        sm: '25px',
        md: '30px',
        lg: '35px',
        xl: '40px', // Original size for larger screens
    });

    // Function to render the Ludo board cells
    const renderBoard = useCallback(() => {
        const cells = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const cellType = getCellType(row, col);
                let bgColor = 'gray.100'; // Default empty cell
                let borderColor = 'gray.300';

                switch (cellType) {
                    case 'center':
                        bgColor = 'gray.800';
                        borderColor = 'gray.900';
                        break;
                    case 'baseRed':
                        bgColor = 'red.100';
                        borderColor = 'red.300';
                        break;
                    case 'baseGreen':
                        bgColor = 'green.100';
                        borderColor = 'green.300';
                        break;
                    case 'baseBlue':
                        bgColor = 'blue.100';
                        borderColor = 'blue.300';
                        break;
                    case 'basePurple':
                        bgColor = 'purple.100';
                        borderColor = 'purple.300';
                        break;
                    case 'mainPath':
                        bgColor = 'gray.300';
                        borderColor = 'gray.500';
                        break;
                    case 'safeSpot':
                        bgColor = 'yellow.300';
                        borderColor = 'yellow.500';
                        break;
                    case 'startRed':
                        bgColor = 'red.300';
                        borderColor = 'red.500';
                        break;
                    case 'startGreen':
                        bgColor = 'green.300';
                        borderColor = 'green.500';
                        break;
                    case 'startBlue':
                        bgColor = 'blue.300';
                        borderColor = 'blue.500';
                        break;
                    case 'startPurple':
                        bgColor = 'purple.300';
                        borderColor = 'purple.500';
                        break;
                    case 'homePathRed':
                        bgColor = 'red.200';
                        borderColor = 'red.400';
                        break;
                    case 'homePathGreen':
                        bgColor = 'green.200';
                        borderColor = 'green.400';
                        break;
                    case 'homePathBlue':
                        bgColor = 'blue.200';
                        borderColor = 'blue.400';
                        break;
                    case 'homePathPurple':
                        bgColor = 'purple.200';
                        borderColor = 'purple.400';
                        break;
                    default:
                        // For the empty corners, make them blend with background or be distinct
                        if ((row < 6 && col < 6) || (row < 6 && col > 8) || (row > 8 && col < 6) || (row > 8 && col > 8)) {
                            bgColor = 'gray.700'; // Darker corners
                            borderColor = 'gray.800';
                        }
                        break;
                }

                // Collect tokens for this cell
                const tokensInCell: { playerId: string; tokenIndex: number; color: string; }[] = [];
                Object.values(players).forEach(player => {
                    player.tokens.forEach((token, index) => {
                        if (!token.isHome && token.gridPos[0] === row && token.gridPos[1] === col) {
                            tokensInCell.push({ playerId: player.id, tokenIndex: index, color: player.color });
                        }
                    });
                });

                cells.push(
                    <Box
                        key={`${row}-${col}`}
                        width={responsiveCellSize}
                        height={responsiveCellSize}
                        bg={bgColor}
                        border="1px solid"
                        borderColor={borderColor}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        position="relative"
                        overflow="hidden"
                    >
                        {cellType === 'safeSpot' && (
                            <Text fontSize="md" color="gray.700" position="absolute">★</Text>
                        )}
                        {/* Render tokens in the cell */}
                        {tokensInCell.map((token, idx) => {
                            const isHopping = hoppingToken?.playerId === token.playerId && hoppingToken?.tokenIndex === token.tokenIndex;
                            const currentHopType = isHopping ? hoppingToken.hopType : 'normal';

                            let animationStyle;
                            switch (currentHopType) {
                                case 'joyful':
                                    animationStyle = `${joyfulHopAnimation} 0.3s ease-in-out`;
                                    break;
                                case 'frustrated':
                                    animationStyle = `${frustratedHopAnimation} 0.3s ease-in-out`;
                                    break;
                                case 'fast':
                                    animationStyle = `${fastHopAnimation} 0.2s ease-out`; // Faster animation
                                    break;
                                default:
                                    animationStyle = `${normalHopAnimation} 0.3s ease-in-out`;
                                    break;
                            }

                            // Calculate stacking transform to prevent tokens from overlapping completely
                            const stackingTransform = tokensInCell.length > 1
                                ? (idx % 2 === 0
                                    ? (idx < 2 ? 'translate(-25%, -25%)' : 'translate(-25%, 25%)')
                                    : (idx < 2 ? 'translate(25%, -25%)' : 'translate(25%, 25%)')
                                )
                                : 'translate(0,0)'; // No transform if only one token

                            return (
                                <Circle
                                    key={`${token.playerId}-${token.tokenIndex}`}
                                    size={tokensInCell.length > 1 ? '50%' : '70%'} // Adjust size if multiple tokens
                                    bg={token.color}
                                    border={selectedTokenIndex === token.tokenIndex && currentPlayerId === token.playerId && gamePhase === 'SELECT_TOKEN_TO_MOVE' ? '2px solid white' : 'none'}
                                    boxShadow={selectedTokenIndex === token.tokenIndex && currentPlayerId === token.playerId && gamePhase === 'SELECT_TOKEN_TO_MOVE' ? '0 0 0 3px ' + token.color : 'none'}
                                    cursor={gamePhase === 'SELECT_TOKEN_TO_MOVE' && currentPlayerId === humanPlayerId ? 'pointer' : 'default'}
                                    onClick={() => handleTokenClickRef.current?.(token.playerId, token.tokenIndex)}
                                    position="absolute" // Always absolute for precise positioning within cell
                                    transform={isHopping ? 'translateY(0)' : stackingTransform} // Let animation handle transform if hopping
                                    animation={isHopping ? animationStyle : 'none'}
                                    transition="all 0.1s ease-in-out" // Smooth transition for token movement
                                />
                            );
                        })}
                    </Box>
                );
            }
        }
        return cells;
    }, [getCellType, players, responsiveCellSize, gamePhase, currentPlayerId, humanPlayerId, selectedTokenIndex, hoppingToken]);


    if (isLoading) {
        return (
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
        );
    }

    if (!isGameStarted) {
        return (
            <Center
                position="absolute"
                top="0"
                left="0"
                width="100%"
                height="100%"
                bg="gray.800"
                zIndex="20"
                flexDirection="column"
            >
                <Text color="white" fontSize="3xl" fontWeight="bold" mb={8}>
                    Select Number of Players
                </Text>
                <VStack spacing={6}>
                    <Button
                        colorScheme="teal"
                        size="lg"
                        onClick={() => setNumPlayers(2)}
                    >
                        2 Players (Local)
                    </Button>
                    <Button
                        colorScheme="teal"
                        size="lg"
                        onClick={() => setNumPlayers(3)}
                    >
                        3 Players (Local)
                    </Button>
                    <Button
                        colorScheme="teal"
                        size="lg"
                        onClick={() => setNumPlayers(4)}
                    >
                        4 Players (Local)
                    </Button>
                </VStack>
            </Center>
        );
    }

    return (
        <Box
            sx={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                bg: "gray.700", // Background color for the page
            }}
        >
            {/* Game Info Panel */}
            {gamePhase !== 'GAME_OVER' && (
                <Box
                    position="absolute"
                    top="4"
                    left="4"
                    bg="rgba(0,0,0,0.6)"
                    p={4}
                    borderRadius="md"
                    color="white"
                    zIndex="10"
                    minWidth="200px"
                >
                    <Text fontSize="lg" mb={2}>Current Turn: <Text as="span" fontWeight="bold">{currentPlayerId.replace('player', 'Player ')}</Text></Text>
                    {/* Display the previously rolled dice value */}
                    {previousDiceDisplayValue !== null && (
                        <Text fontSize="md" mb={2}>Last Roll: <Text as="span" fontWeight="bold">{previousDiceDisplayValue}</Text></Text>
                    )}
                    {gamePhase === 'ROLL_DICE' && currentPlayerId === humanPlayerId && rollsLeft > 0 && (
                        <Text fontSize="sm" mt={2}>Rolls Left: {rollsLeft}</Text>
                    )}
                    {gamePhase === 'SELECT_TOKEN_TO_MOVE' && currentPlayerId === humanPlayerId && (
                        <Text fontSize="sm" mt={2}>Click on a token to move it.</Text>
                    )}
                    {gamePhase === 'ANIMATING_MOVE' && (
                        <Text fontSize="sm" mt={2}>Animating move...</Text>
                    )}
                    {gamePhase === 'ROLL_DICE' && currentPlayerId === botPlayerId && (
                        <Text fontSize="sm" mt={2}>Bot is rolling...</Text>
                    )}
                    {gamePhase === 'ANIMATING_DICE' && (
                        <Text fontSize="sm" mt={2}>Dice rolling...</Text>
                    )}
                </Box>
            )}

            {/* Buttons Panel (Logs and Help) */}
            <VStack
                position="absolute"
                top="4"
                right="4"
                zIndex="10"
                spacing={2} // Space between buttons
            >
                <Button onClick={() => setShowLogsModal(true)} colorScheme="gray" size="sm" leftIcon={<InfoIcon />}>
                    View Logs
                </Button>
                <Button onClick={() => setShowHelpModal(true)} colorScheme="gray" size="sm" leftIcon={<QuestionIcon />}>
                    How to Play
                </Button>
            </VStack>


            {/* Ludo Board Grid */}
            <Grid
                templateColumns={`repeat(${BOARD_SIZE}, ${responsiveCellSize})`}
                templateRows={`repeat(${BOARD_SIZE}, ${responsiveCellSize})`}
                gap="0px"
                border="2px solid black"
                boxShadow="xl"
                borderRadius="md"
                overflow="hidden"
                zIndex="5"
                // Center the board
                margin="auto"
            >
                {renderBoard()}
            </Grid>

            {/* Roll Dice Buttons for each player */}
            {playerOrder.map(playerId => {
                const isCurrentPlayer = currentPlayerId === playerId;
                const isHumanPlayer = (gameMode === 'local-friends') || (playerId === humanPlayerId); // All players are human in local-friends mode

                let buttonPositionProps: any = {};
                let buttonTransform: string = 'translateX(-50%)';
                let buttonRotation: string = '0deg';

                switch (playerId) {
                    case 'player1': // Red - Bottom
                        buttonPositionProps = { bottom: '4', left: '50%' };
                        buttonTransform = 'translateX(-50%)';
                        break;
                    case 'player2': // Green - Right
                        buttonPositionProps = { right: '4', top: '50%' };
                        buttonTransform = 'translateY(-50%) rotate(90deg)';
                        buttonRotation = '90deg';
                        break;
                    case 'player3': // Blue - Top
                        buttonPositionProps = { top: '4', left: '50%' };
                        buttonTransform = 'translateX(-50%) rotate(180deg)';
                        buttonRotation = '180deg';
                        break;
                    case 'player4': // Purple - Left
                        buttonPositionProps = { left: '4', top: '50%' };
                        buttonTransform = 'translateY(-50%) rotate(-90deg)';
                        buttonRotation = '-90deg';
                        break;
                }

                return (
                    (isCurrentPlayer && isHumanPlayer && gamePhase === 'ROLL_DICE') && (
                        <Box
                            key={`roll-button-${playerId}`}
                            position="absolute"
                            {...buttonPositionProps}
                            zIndex="10"
                            style={{ transform: buttonTransform }}
                        >
                            <Button
                                onClick={() => rollDiceRef.current?.()}
                                colorScheme={players[playerId]?.color.split('.')[0] || 'teal'} // Use player color
                                size="lg"
                                px={10}
                                py={6}
                                borderRadius="full"
                                boxShadow="lg"
                                fontSize="xl"
                                isDisabled={isDiceAnimating}
                                _hover={{ transform: `scale(1.05) rotate(${buttonRotation})` }}
                                _active={{ transform: `scale(0.95) rotate(${buttonRotation})` }}
                                transition="all 0.2s"
                                style={{ transform: `rotate(${buttonRotation})` }} // Apply rotation directly to button
                            >
                                Roll Dice
                            </Button>
                        </Box>
                    )
                );
            })}


            {/* Dice Animation Component */}
            {isDiceAnimating && rolledDiceValue !== null && (
                <DiceAnimation
                    diceValue={rolledDiceValue}
                    playerId={currentPlayerId}
                    onAnimationEnd={handleDiceAnimationEnd}
                />
            )}

            {/* Logs Modal */}
            <Modal isOpen={showLogsModal} onClose={() => setShowLogsModal(false)} size="xl">
                <ModalOverlay />
                <ModalContent bg="rgba(0,0,0,0.9)" color="white" borderRadius="md">
                    <ModalHeader>Game Logs</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody maxHeight="70vh" overflowY="auto">
                        <VStack spacing={2} align="stretch">
                            {gameLogs.length === 0 ? (
                                <Text>No logs available yet.</Text>
                            ) : (
                                gameLogs.map((log, index) => (
                                    <Text key={index} fontSize="sm">{log}</Text>
                                ))
                            )}
                        </VStack>
                    </ModalBody>
                </ModalContent>
            </Modal>

            {/* How to Play Modal */}
            <Modal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} size="xl">
                <ModalOverlay />
                <ModalContent bg="rgba(0,0,0,0.9)" color="white" borderRadius="md">
                    <ModalHeader>How to Play Ludo</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody maxHeight="70vh" overflowY="auto" pb={6}>
                        <VStack spacing={4} align="stretch">
                            <Text fontSize="md">
                                Welcome to Ludo! This classic board game is all about racing your four tokens from your starting base to your home triangle.
                            </Text>

                            <Text fontSize="lg" fontWeight="bold">Objective:</Text>
                            <Text fontSize="md">
                                Be the first player to move all four of your tokens into your home triangle.
                            </Text>

                            <Text fontSize="lg" fontWeight="bold">Game Setup:</Text>
                            <Text fontSize="md">
                                Each player has four tokens of a specific color (Red, Green, Blue, Purple) starting in their respective colored base areas.
                            </Text>

                            <Text fontSize="lg" fontWeight="bold">How to Play:</Text>
                            <VStack align="stretch" pl={4} spacing={2}>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">1. Rolling the Dice:</Text>
                                    Players take turns rolling a single six-sided die.
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="bold">2. Getting Tokens Out of Base:</Text>
                                    You need to roll a <Text as="span" fontWeight="bold">6</Text> to move a token out of your base and onto its starting position on the main path.
                                    <Text as="i" display="block" mt={1}>Example: If you roll a 6, you can move one of your tokens from your base to your starting square. You also get an extra roll!</Text>
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">3. Moving Tokens:</Text>
                                    Once a token is out of its base, you can move it clockwise along the main path according to the number rolled on the die.
                                    <Text as="i" display="block" mt={1}>Example: If your token is on the path and you roll a 4, you move that token four squares forward.</Text>
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">4. Capturing Opponent's Tokens:</Text>
                                    If your token lands on a square occupied by an opponent's token (and it's not a safe spot marked with a ★), the opponent's token is captured and sent back to their base. You get an extra roll!
                                    <Text as="i" display="block" mt={1}>Example: Your token is on square A. You roll a 3. An opponent's token is on square D (3 squares from A). You move your token to D, and the opponent's token returns to their base.</Text>
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">5. Safe Spots:</Text>
                                    Squares marked with a ★ are safe spots. Tokens on these squares cannot be captured. Your own starting square is also a safe spot.
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">6. Rolling a 6:</Text>
                                    If you roll a 6, you get an extra turn. You can use the 6 to get a token out of base, or move an existing token. After moving with the 6, you roll again. If you roll three consecutive 6s, your turn ends and you lose your last move.
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">7. Entering Home Path:</Text>
                                    After completing a full round on the main path, your tokens enter their respective colored home paths. You must move your tokens precisely into the home triangle (the center square).
                                    <Text as="i" display="block" mt={1}>Example: Your token is 2 squares away from your home triangle entry. You roll a 2. You move your token into the home path.</Text>
                                </Text>
                                <Text fontSize="md">
                                    <Text as="span" fontWeight="semibold">8. Reaching Home:</Text>
                                    To move a token into the center home square, you must roll the exact number of steps required. If you roll too high, you cannot move that token.
                                    <Text as="i" display="block" mt={1}>Example: Your token is 1 square from home. You roll a 1, and your token enters home. If you roll a 2, you cannot move that token.</Text>
                                </Text>
                            </VStack>

                            <Text fontSize="lg" fontWeight="bold">Winning the Game:</Text>
                            <Text fontSize="md">
                                The first player to get all four of their tokens into their home triangle wins the game!
                            </Text>
                        </VStack>
                    </ModalBody>
                </ModalContent>
            </Modal>

            {/* Game Over Overlay */}
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
                    <Button onClick={() => window.location.reload()} colorScheme="teal" mt={6}>
                        Play Again
                    </Button>
                </Center>
            )}
        </Box>
    );
}
