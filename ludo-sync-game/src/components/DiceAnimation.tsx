// src/components/DiceAnimation.tsx
import React, { useEffect, useState } from 'react';
import { Box, Circle, Flex, Center } from '@chakra-ui/react';
import { keyframes } from '@emotion/react'; // Corrected: Import keyframes from @emotion/react

interface DiceAnimationProps {
    diceValue: number;
    playerId: string; // 'player1', 'player2', 'player3', 'player4' - used for animation direction
    onAnimationEnd: () => void; // Callback when animation finishes
}

// Keyframes for dice entry and rolling animation
// The translate values are relative to the viewport to simulate rolling in from player's general direction
const player1RollIn = keyframes` /* From bottom-right for Player 1 (Red) */
  0% { transform: translate(100vw, 100vh) rotateX(0deg) rotateY(0deg) rotateZ(0deg); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(0, 0) rotateX(720deg) rotateY(720deg) rotateZ(720deg); opacity: 1; }
`;

const player2RollIn = keyframes` /* From top-right for Player 2 (Green) */
  0% { transform: translate(100vw, -100vh) rotateX(0deg) rotateY(0deg) rotateZ(0deg); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(0, 0) rotateX(720deg) rotateY(720deg) rotateZ(720deg); opacity: 1; }
`;

const player3RollIn = keyframes` /* From top-left for Player 3 (Blue) */
  0% { transform: translate(-100vw, -100vh) rotateX(0deg) rotateY(0deg) rotateZ(0deg); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(0, 0) rotateX(720deg) rotateY(720deg) rotateZ(720deg); opacity: 1; }
`;

const player4RollIn = keyframes` /* From bottom-left for Player 4 (Purple) */
  0% { transform: translate(-100vw, 100vh) rotateX(0deg) rotateY(0deg) rotateZ(720deg); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(0, 0) rotateX(720deg) rotateY(720deg) rotateZ(720deg); opacity: 1; }
`;

// Function to select the appropriate animation based on the current player
const getAnimation = (playerId: string) => {
    switch (playerId) {
        case 'player1': return player1RollIn;
        case 'player2': return player2RollIn;
        case 'player3': return player3RollIn;
        case 'player4': return player4RollIn;
        default: return player1RollIn; // Fallback to player1's animation
    }
};

const DiceAnimation: React.FC<DiceAnimationProps> = ({ diceValue, playerId, onAnimationEnd }) => {
    const [animationKey, setAnimationKey] = useState(0); // Used to re-trigger the animation on prop change

    useEffect(() => {
        // Increment key to force re-render and re-trigger animation when diceValue changes
        setAnimationKey(prev => prev + 1);
        // Set a timer to call onAnimationEnd after the animation duration (2 seconds)
        const timer = setTimeout(() => {
            onAnimationEnd();
        }, 2000); // Corrected: Animation duration is 2s

        return () => clearTimeout(timer); // Cleanup timer on unmount or re-render
    }, [diceValue, onAnimationEnd]);

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
        <Center
            position="absolute"
            top="0"
            left="0"
            width="100%"
            height="100%"
            zIndex="25" // Ensure dice is above the board but below game over overlay
            pointerEvents="none" // Allow clicks to pass through to the board
        >
            <Box
                key={animationKey} // Key to re-trigger animation when diceValue changes
                width={{ base: "30px", md: "40px", lg: "50px" }} // Doubled size
                height={{ base: "30px", md: "40px", lg: "50px" }} // Doubled size
                bg="gray.800"
                borderRadius="md"
                boxShadow="lg"
                position="relative"
                overflow="hidden"
                animation={`${getAnimation(playerId)} 2s ease-out forwards`} // Animation duration is 2s
                display="flex"
                alignItems="center"
                justifyContent="center"
            >
                {renderDots(diceValue)}
            </Box>
        </Center>
    );
};

export default DiceAnimation;