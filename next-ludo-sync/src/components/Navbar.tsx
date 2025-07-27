// src/components/Navbar.tsx
'use client';

import React, { useState } from 'react';
import {
    Box, Flex, Heading, Button, HStack, IconButton, Image, useBreakpointValue, useTheme, Stack
} from '@chakra-ui/react';
import { FiMenu, FiX } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Link from 'next/link'; // Assuming Next.js Link for navigation

interface NavbarProps {
    appName: string;
    siteLogoUrl?: string;
    type?: 'customer' | 'dashboard'; // To differentiate navbar types if needed
}

export function Navbar({ appName, siteLogoUrl, type = 'customer' }: NavbarProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isMobile = useBreakpointValue({ base: true, md: false });
    const theme = useTheme();

    // Define a generic glass card style for the navbar background
    const glassCardStyle = {
        background: 'rgba(25, 25, 35, 0.45)',
        backdropFilter: 'blur(14px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: `
      0 8px 32px rgba(0, 0, 0, 0.25),
      inset 0 1px 1px rgba(255, 255, 255, 0.1)
    `,
        borderRadius: 'xl', // Apply rounded corners
    };

    const menuItems = [
        { name: 'Home', href: '/' },
        //{ name: 'Dev Projects', href: '/projects' },
        { name: '3d Showcase', href: '/house-viewer' },
        //{ name: 'Contact', href: '/contact' },
    ];

    return (
        <Flex
            as="nav"
            position="fixed"
            top={0}
            left={0}
            right={0}
            zIndex={50}
            justify="space-between"
            align="center"
            px={{ base: 4, md: 8 }}
            py={4}
            sx={glassCardStyle}
        >
            <Link href="/" passHref>
                <HStack spacing={3} align="center" cursor="pointer">
                    {siteLogoUrl ? (
                        <Image src={siteLogoUrl} alt={`${appName} Logo`} boxSize="40px" objectFit="contain" />
                    ) : (
                        <Heading as="h1" size="lg" color="white">
                            {appName.split(' ')[0]}<span style={{ color: theme.colors.brand[500] }}>{appName.split(' ')[1]}</span>
                        </Heading>
                    )}
                </HStack>
            </Link>

            {isMobile ? (
                <IconButton
                    icon={mobileMenuOpen ? <FiX /> : <FiMenu />}
                    aria-label="Toggle menu"
                    variant="ghost"
                    color="white"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                />
            ) : (
                <HStack spacing={8}>
                    {menuItems.map((item) => (
                        <Button
                            key={item.name}
                            as={Link}
                            href={item.href}
                            variant="ghost"
                            color="white"
                            _hover={{ color: theme.colors.brand[300] }}
                        >
                            {item.name}
                        </Button>
                    ))}
                </HStack>
            )}

            <Button
                colorScheme="brand"
                size="sm"
                display={{ base: "none", md: "block" }}
                as={Link}
                href="/contact" // Assuming a contact page for "Get Started"
            >
                Get Started
            </Button>

            {mobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    style={{
                        position: 'fixed',
                        top: '70px', // Adjust based on navbar height
                        left: 0,
                        right: 0,
                        zIndex: 40,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: '1rem',
                        backdropFilter: 'blur(10px)',
                        borderRadius: theme.radii.xl, // Apply rounded corners
                        margin: '0 1rem', // Add some margin from the sides
                    }}
                >
                    <Stack direction="column" spacing={2}>
                        {menuItems.map((item) => (
                            <Button
                                key={item.name}
                                as={Link}
                                href={item.href}
                                variant="ghost"
                                color="white"
                                justifyContent="flex-start"
                                onClick={() => setMobileMenuOpen(false)} // Close menu on item click
                            >
                                {item.name}
                            </Button>
                        ))}
                        <Button
                            colorScheme="brand"
                            mt={4}
                            as={Link}
                            href="/contact"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Get Started
                        </Button>
                    </Stack>
                </motion.div>
            )}
        </Flex>
    );
}
