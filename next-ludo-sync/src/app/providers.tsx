// src/app/providers.tsx
'use client'

import { ChakraProvider } from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import themes from './theme/theme' // Import your custom theme
import { PageTransitionProvider } from '@/components/PageTransitionProvider' // Import PageTransitionProvider
//import { AuthProvider } from '@/context/AuthContext'; // Import AuthProvider

// Dynamically import ThemeProvider from next-themes with ssr: false
const ThemeProvider = dynamic(
  () => import('next-themes').then((mod) => mod.ThemeProvider),
  { ssr: false }
)

interface ProvidersProps {
  children?: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ChakraProvider theme={themes}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark" // Ensure dark mode is default
        enableSystem={false}
        disableTransitionOnChange
      >
        <PageTransitionProvider>
{/**            <AuthProvider>*/}
            {children}
{/**           </AuthProvider>*/}
        </PageTransitionProvider>
      </ThemeProvider>
    </ChakraProvider>
  )
}
