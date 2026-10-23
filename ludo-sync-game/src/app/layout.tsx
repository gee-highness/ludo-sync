import { Inter } from "next/font/google";
import { ChakraProviders } from "@/components/ChakraProviders"; // Import the client component
import type { Metadata, Viewport } from "next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Define metadata for the PWA manifest
export const metadata: Metadata = {
  title: 'Ludo Sync',
  applicationName: 'Ludo Sync',
  description: 'Classic Ludo for 2 to 4 players. Play bots, pass-and-play, or pair with friends online.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Ludo Sync', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

// viewport-fit=cover lets the board use the full screen around notches; the UI pads with safe-area insets
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#10172E',
  colorScheme: 'dark',
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ background: "#10172E" }}>
      <body className={inter.variable} style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        <ChakraProviders> {/* Use the client-side ChakraProviders */}
          {children}
        </ChakraProviders>
      </body>
    </html>
  );
}