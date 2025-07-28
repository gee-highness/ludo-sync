import { Inter } from "next/font/google";
import { ChakraProviders } from "@/components/ChakraProviders"; // Import the client component

const inter = Inter({ subsets: ["latin"] });

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