// src/app/layout.tsx
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import ClientLayout from '@/components/ClientLayout'
import { client, urlForImage } from '@/lib/sanity'
import { groq } from 'next-sanity'
import { SiteSettings } from '@/types/sanity'

import { Analytics } from "@vercel/analytics/next"

const inter = Inter({ subsets: ['latin'] })

async function getSiteSettings(): Promise<SiteSettings | null> {
  const query = groq`
    *[_type == "siteSettings"][0]{
      title,
      logo
    }
  `;
  try {
    return await client.fetch(query);
  } catch (error) {
    console.error("Failed to fetch site settings:", error);
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const siteSettings = await getSiteSettings();
  const siteLogoUrl = siteSettings?.logo ? urlForImage(siteSettings.logo).url() : undefined;

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#FF4F00" />
      </head>
      <body className={inter.className}>
        <Providers>
          <ClientLayout
            siteTitle={siteSettings?.title || "Synapse Digital"}
            siteLogoUrl={siteLogoUrl}
          >
            <Analytics />
            {children}
          </ClientLayout>
        </Providers>
      </body>
    </html>
  )
}