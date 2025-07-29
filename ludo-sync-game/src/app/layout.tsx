import { Inter } from "next/font/google";
import { ChakraProviders } from "@/components/ChakraProviders"; // Import the client component
import { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

// Define metadata for the PWA manifest
export const metadata: Metadata = {
  title: 'Ludo Sync',
  description: 'A fun Ludo game to play with friends or bots.',
  manifest: '/manifest.json', // Reference to the PWA manifest file
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ChakraProviders> {/* Use the client-side ChakraProviders */}
          {children}
        </ChakraProviders>
      </body>
    </html>
  );
}