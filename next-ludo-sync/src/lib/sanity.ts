// src/lib/sanity.ts
import { createClient, SanityClient, groq } from 'next-sanity'; // Import groq here
import createImageUrlBuilder from '@sanity/image-url';
import type { Image } from 'sanity';
import { SanityImageSource } from '@sanity/image-url/lib/types/types';

// Environment variables for Sanity connection
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-05-20'; // Using a recent API version
const useCdn = process.env.NODE_ENV === 'production'; // Use CDN in production for faster reads

// Define the Sanity client instance
export const client: SanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn,
  // Add a token if you need to fetch draft content or private datasets
  // token: process.env.SANITY_API_READ_TOKEN,
});

// Helper function for fetching data with caching and revalidation
export async function sanityFetch<QueryResponse>({
  query,
  params = {},
  tags,
  revalidate = 60, // Default revalidate every 60 seconds (ISR)
}: {
  query: string;
  params?: Record<string, string | number | boolean>;
  tags?: string[];
  revalidate?: number | false;
}): Promise<QueryResponse> {
  return client.fetch<QueryResponse>(query, params, {
    next: {
      revalidate: revalidate,
      tags: tags,
    },
  });
}

// Initialize the image URL builder with your Sanity project details
const imageBuilder = createImageUrlBuilder({
  projectId: projectId,
  dataset: dataset,
});

// Helper function to build image URLs for Next.js Image component
export const urlForImage = (source: SanityImageSource) => {
  return imageBuilder?.image(source).auto('format').fit('max');
};

// Define a separate client for write operations (if needed, with a write token)
export const writeClient = createClient({
  projectId: projectId,
  dataset: dataset,
  apiVersion: apiVersion,
  useCdn: false, // Always ensure fresh data and write capabilities for writes
  token: process.env.NEXT_PUBLIC_SANITY_API_WRITE_TOKEN, // Ensure this token is set for write operations
});


// Define project query using groq directly
export const projectQuery = groq`
  *[_type == "project"]{
    _id,
    title,
    slug,
    tagline,
    mainImage,
    "servicesProvided": servicesProvided[]->{
      _id,
      title,
      slug
    },
    technologiesUsed,
    projectDate,
  }
`;

// Define service query using groq directly
export const serviceQuery = groq`
  *[_type == "service"]{
    _id,
    name,
    slug,
    shortDescription,
    description,
    icon,
    keyFeatures,
    relatedProjects[]->{
      _id,
      title,
      slug
    }
  }
`;

// Define site settings query using groq directly
export const siteSettingsQuery = groq`
  *[_type == "siteSettings"][0]{
    title,
    description,
    coverImage,
    logo
  }
`;
