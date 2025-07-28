// src/components/DiceAnimation.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Box, Circle } from '@chakra-ui/react'; // Removed unused 'Flex'
import { keyframes } from '@emotion/react';

interface DiceAnimationProps {
    diceValue: number;
    //playerId: string; // 'player1', 'player2', 'player3', 'player4' - used for animation direction
    onAnimationEnd: () => void; // Callback when animation finishes
    startTop: number; // Pixel top coordinate for dice start
    startLeft: number; // Pixel left coordinate for dice start
    boardCenterTop: number; // Pixel top coordinate for board center
    boardCenterLeft: number; // Pixel left coordinate for board center
}

// Redefine getAnimation to use pixel deltas for transform
const getAnimation = (
    // playerId is kept for potential future player-specific visual styles (e.g., initial rotation)
    startTop: number,
    startLeft: number,
    boardCenterTop: number,
    boardCenterLeft: number
) => {
    const deltaX = boardCenterLeft - startLeft;
    const deltaY = boardCenterTop - startTop;

    // Simplified roll animation: always starts from (0,0) (its own positioned origin)
    // and animates to the calculated board center.
    const rollInAnimation = keyframes`
      0% { transform: translate(0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translate(${deltaX}px, ${deltaY}px) rotateX(720deg) rotateY(720deg) rotateZ(720deg); opacity: 1; }
    `;
    return rollInAnimation;
};

const DiceAnimation: React.FC<DiceAnimationProps> = ({
    diceValue,
    //playerId,
    onAnimationEnd,
    startTop,
    startLeft,
    boardCenterTop,
    boardCenterLeft
}) => {
    const [animationKey, setAnimationKey] = useState(0); // Used to re-trigger the CSS animation on prop change
    const [displayDiceValue, setDisplayDiceValue] = useState(1); // State for changing dots during animation
    const intervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for setInterval timer
    const timeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for setTimeout timer

    useEffect(() => {
        // Increment key to force re-render and re-trigger CSS animation when diceValue changes
        setAnimationKey(prev => prev + 1);

        // Clear any previous timers to prevent memory leaks or multiple intervals running
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        // Start changing dots rapidly
        let currentDot = 1;
        setDisplayDiceValue(currentDot); // Set initial display value for the start of the roll

        intervalRef.current = setInterval(() => {
            currentDot = (currentDot % 6) + 1; // Cycle through 1 to 6
            setDisplayDiceValue(currentDot);
        }, 80); // Change dot every 80ms for a quick rolling effect

        // Define total animation duration and when dots should settle
        const totalAnimationDuration = 500; // 2 seconds (matches CSS animation duration)
        const dotSettleTime = 400; // Dots will stop changing after 1.5 seconds

        // Set the final dice value and clear the interval after dotSettleTime
        timeoutRef.current = setTimeout(() => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setDisplayDiceValue(diceValue); // Set the actual final value

            // Call onAnimationEnd after the full CSS animation duration has completed
            // This is crucial to ensure game logic proceeds only after the visual animation is complete
            setTimeout(() => {
                onAnimationEnd();
            }, totalAnimationDuration - dotSettleTime); // Remaining time for CSS animation to finish
        }, dotSettleTime);


        // Cleanup function: Clear timers on unmount or when dependencies change
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [diceValue, onAnimationEnd, startTop, startLeft, boardCenterTop, boardCenterLeft]); // Dependencies for useEffect

    const dotSize = '15%'; // Size of each dot relative to the dice cube
    const dotColor = 'white';

    // Function to render dots based on the dice value
    const renderDots = (value: number) => {
        const dots = [];
        // Define positions for dots on a 3x3 grid within the dice face
        const dotPositions = {
            1: ['center'],
            2: ['top-left', 'bottom-right'],
            3: ['top-left', 'center', 'bottom-right'],
            4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
            6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
        };

        const positions = dotPositions[value as keyof typeof dotPositions];

        if (!positions) return null;

        // Helper to get CSS styles for each dot position
        const getDotStyle = (pos: string) => {
            switch (pos) {
                case 'top-left': return { top: '15%', left: '15%' };
                case 'top-right': return { top: '15%', right: '15%' };
                case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
                case 'bottom-left': return { bottom: '15%', left: '15%' };
                case 'bottom-right': return { bottom: '15%', right: '15%' };
                case 'middle-left': return { top: '50%', left: '15%', transform: 'translateY(-50%)' };
                case 'middle-right': return { top: '50%', right: '15%', transform: 'translateY(-50%)' };
                default: return {};
            }
        };

        for (let i = 0; i < positions.length; i++) {
            dots.push(
                <Circle
                    key={i}
                    size={dotSize}
                    bg={dotColor}
                    position="absolute"
                    {...getDotStyle(positions[i])}
                />
            );
        }
        return dots;
    };

    return (
        <Box
            key={animationKey} // Key to re-trigger animation when diceValue changes
            position="absolute" // Set position directly from props
            top={startTop}
            left={startLeft}
            width={{ base: "30px", md: "40px", lg: "50px" }} // Doubled size
            height={{ base: "30px", md: "40px", lg: "50px" }} // Doubled size
            bg="gray.800"
            borderRadius="md"
            boxShadow="lg"
            overflow="hidden"
            // Pass all necessary pixel values to getAnimation
            animation={`${getAnimation(startTop, startLeft, boardCenterTop, boardCenterLeft)} 0.5s ease-out forwards`} // Animation duration is 2s
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex="25" // Ensure dice is above the board but below game over overlay
            pointerEvents="none" // Allow clicks to pass through to the board
        >
            {renderDots(displayDiceValue)} {/* Render dots based on the changing displayDiceValue */}
        </Box>
    );
};

export default DiceAnimation;