// src/components/ContactForm.tsx
'use client'; // This directive makes it a Client Component

import React, { useState, FormEvent } from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Button,
  useToast,
  VStack,
  Heading,
  Text,
  useColorModeValue, // Keep for potential light mode adjustments
  useTheme, // Import useTheme to access custom colors
} from '@chakra-ui/react';

interface FormData {
  name: string;
  email: string;
  phone?: string; // Optional
  subject: string;
  message: string;
}

export default function ContactForm() {
  const toast = useToast();
  const theme = useTheme(); // Access the theme to get custom colors
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    // Basic client-side validation
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields (Name, Email, Subject, Message).',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: 'Message Sent!',
          description: 'Your message has been successfully sent. We will get back to you shortly.',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
        // Clear the form
        setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
      } else {
        const errorData = await response.json();
        toast({
          title: 'Error Sending Message',
          description: errorData.message || 'Something went wrong. Please try again later.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Network or unexpected error:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect to the server. Please check your internet connection.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Use theme colors directly for dark mode, or use useColorModeValue for light mode compatibility
  const formBg = theme.colors.neutral.dark['bg-card'];
  const borderColor = theme.colors.neutral.dark['border-color'];
  const headingColor = theme.colors.neutral.dark['text-primary'];
  const textColor = theme.colors.neutral.dark['text-secondary'];

  return (
    <Box
      as="form"
      onSubmit={handleSubmit}
      p={8}
      borderRadius="lg"
      boxShadow="lg"
      bg={formBg}
      borderWidth="1px"
      borderColor={borderColor}
      maxWidth="600px"
      mx="auto"
      my={10}
    >
      <VStack spacing={6} align="stretch">
        <Heading as="h2" size="xl" textAlign="center" color={headingColor} mb={2}>
          Get in Touch
        </Heading>
        <Text textAlign="center" color={textColor} fontSize="md">
          Have a question about our services or a project idea? Send us a message!
        </Text>

        <FormControl id="name" isRequired>
          <FormLabel color={textColor}>Your Name</FormLabel>
          <Input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="John Doe"
          />
        </FormControl>

        <FormControl id="email" isRequired>
          <FormLabel color={textColor}>Your Email</FormLabel>
          <Input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="john.doe@example.com"
          />
        </FormControl>

        <FormControl id="phone">
          <FormLabel color={textColor}>Phone Number (Optional)</FormLabel>
          <Input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="e.g., +123 456 7890"
          />
        </FormControl>

        <FormControl id="subject" isRequired>
          <FormLabel color={textColor}>Subject</FormLabel>
          <Input
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            placeholder="Inquiry about software development"
          />
        </FormControl>

        <FormControl id="message" isRequired>
          <FormLabel color={textColor}>Message</FormLabel>
          <Textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            placeholder="Type your message here..."
            rows={6}
          />
        </FormControl>

        <Button
          type="submit"
          colorScheme="brand"
          size="lg"
          isLoading={isLoading}
          loadingText="Sending..."
          alignSelf="center"
          width={{ base: '100%', md: '50%' }}
        >
          Send Message
        </Button>
      </VStack>
    </Box>
  );
}
