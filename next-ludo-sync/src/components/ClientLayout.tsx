// src/components/ClientLayout.tsx
'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Box } from '@chakra-ui/react';
import React from 'react';

export default function ClientLayout({
    children,
    siteTitle,
    siteLogoUrl,
}: {
    children: React.ReactNode;
    siteTitle: string;
    siteLogoUrl?: string;
}) {
    const pathname = usePathname();
    const isDashboardPage = pathname.startsWith('/admin') || pathname.startsWith('/dashboard');
    const isHomeViewerPage = pathname === '/house-viewer'; // Check if it's the home-viewer page
    const navbarType = isDashboardPage ? 'dashboard' : 'customer';

    return (
        <>
            <Navbar
                type={navbarType}
                appName={siteTitle}
                siteLogoUrl={siteLogoUrl}
            />
            <Box
                pt={isHomeViewerPage ? '0' : '64px'} // Apply pt="64px" only if NOT the home-viewer page
                flex="1"
            >
                {children}
            </Box>
            {/* Render Footer only if NOT the home-viewer page */}
            {!isHomeViewerPage && <Footer appName={siteTitle} />}
        </>
    );
}