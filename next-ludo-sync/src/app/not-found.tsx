// src/app/not-found.tsx
'use client'; // Add this directive at the very top

import Link from 'next/link';
import { Box, Flex, Heading, Text, Button, useColorModeValue, useTheme } from '@chakra-ui/react'; // Import useTheme

export default function NotFound() {
  const theme = useTheme(); // Initialize useTheme hook

  // Use theme colors for background and text
  const bgColor = theme.colors.neutral.dark['bg-primary']; // Use dark primary background
  const textColor = theme.colors.neutral.dark['text-primary']; // Use dark primary text color
  const buttonScheme = 'brand'; // This will automatically use your brand colors defined in theme.ts

  return (
    <Flex
      minH="100vh"
      direction="column"
      align="center"
      justify="center"
      bg={bgColor}
      color={textColor}
      textAlign="center"
      p={8}
    >
      {/* Removed barber-pole-container */}
      <Heading as="h1" size="2xl" mt={8} mb={4}>
        404 - Page Not Found
      </Heading>
      <Text fontSize="xl" mb={6}>
        Oops! It looks like this page doesn&apos;t exist.
      </Text>
      <Box mb={8}>
        <Text fontSize="md">
          The page you&apos;re looking for might have been moved or doesn&apos;t exist.
          Please check the URL or go back to the homepage.
        </Text>
      </Box>
      <Link href="/" passHref>
        <Button colorScheme={buttonScheme} size="lg">
          Go Back Home
        </Button>
      </Link>
    </Flex>
  );
}
