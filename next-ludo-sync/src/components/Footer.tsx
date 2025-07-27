// src/components/Footer.tsx
'use client';

import React from 'react';
import {
  Box,
  Text,
  Container,
  useColorModeValue,
  useTheme,
} from '@chakra-ui/react';

interface FooterProps {
  appName?: string;
}

export function Footer({ appName = 'Synapse Digital' }: FooterProps) {
  const theme = useTheme();

  // Use direct theme colors for dark mode, or use useColorModeValue for light mode compatibility
  const footerBg = theme.colors.neutral.dark['bg-secondary'];
  const footerText = theme.colors.neutral.dark['text-secondary'];

  return (
    <Box as="footer" bg={footerBg} color={footerText} p={6} textAlign="center" mt="auto">
      <Container maxW="container.xl">
        <Text>&copy; {new Date().getFullYear()} {appName}. All rights reserved.</Text>
        <Text mt={2}>Crafted with precision and passion.</Text>
      </Container>
    </Box>
  );
}
