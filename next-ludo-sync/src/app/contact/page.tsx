// src/app/contact/page.tsx
'use client'; // This directive makes it a Client Component

import ContactForm from '../../components/ContactForm'; // Adjust path as necessary
import { Box, Container, Flex, useColorModeValue, useTheme } from '@chakra-ui/react'; // Import useTheme

export default function ContactPage() {
  const theme = useTheme(); // Initialize useTheme hook

  // Use theme colors for background and text
  const bgColor = theme.colors.neutral.dark['bg-primary']; // Use dark primary background
  const headingColor = theme.colors.neutral.dark['text-primary']; // Use dark primary text color

  return (
    <Flex
      minH="100vh"
      align="center"
      justify="center"
      bg={bgColor}
      py={10}
    >
      <Container maxW="container.md">
        <ContactForm />
      </Container>
    </Flex>
  );
}
