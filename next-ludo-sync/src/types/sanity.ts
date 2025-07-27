// types/sanity.ts
// This file defines TypeScript interfaces for your Sanity schemas.
// You can generate these automatically using `npx sanity typegen generate`
// after making schema changes, but for now, we'll define them manually.

import { Image as SanityImage } from 'sanity';

// Base Sanity document type
interface SanityDocument {
  _id: string;
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
  _type: string;
}

// Slug type
interface Slug {
  _type: 'slug';
  current: string;
}

// Portable Text Block (simplified)
export interface PortableTextBlock {
  _key: string;
  _type: 'block';
  children: Array<{
    _key: string;
    _type: 'span';
    marks: string[];
    text: string;
  }>;
  markDefs: Array<{
    _key: string;
    _type: string;
    [key: string]: unknown;
  }>;
  style: string;
}

// Sanity Image with alt and caption
export interface CustomImage extends SanityImage {
  alt?: string;
  caption?: string;
}

// Demo Credentials
export interface DemoCredentials {
  username?: string;
  password?: string;
  notes?: string;
}

// Visual Presentation for demos
export interface VisualPresentation {
  imageUrl: any;
  _key: string;
  _type: 'screenshotItem'; // Matches the name in project.ts
  image: CustomImage;
  explanation?: PortableTextBlock[]; // Portable Text for explanation
  embedUrl?: string; // URL for iframe embedding
}

// Demo Link details
export interface DemoLink {
  _key: string;
  _type: 'demoLink'; // Matches the name in project.ts
  label: string;
  url: string;
  description?: string;
  credentials?: DemoCredentials;
}

// Project Schema
export interface Project extends SanityDocument {
  title: string;
  slug: Slug;
  tagline?: string; // Added tagline
  description?: PortableTextBlock[];
  mainImage?: CustomImage;
  demoLinks?: DemoLink[];
  demoScreenshots?: VisualPresentation[];
  servicesProvided?: Service[]; // References to Service documents
  technologiesUsed?: string[]; // Added technologiesUsed
  projectDate?: string; // Date string (YYYY-MM-DD)
}

// Service Schema
export interface Service extends SanityDocument {
  title: string;
  slug: Slug;
  shortDescription?: string;
  description?: PortableTextBlock[]; // Full description for detailed service page
  icon?: CustomImage;
  keyFeatures?: string[];
  relatedProjects?: Project[]; // References to Project documents
}

// About Us (Singleton)
export interface AboutUs extends SanityDocument {
  title: string;
  body: PortableTextBlock[];
  // teamMembers?: Person[]; // If you add a Person schema later
}

// Contact Info (Singleton)
export interface ContactInfo extends SanityDocument {
  email?: string;
  phone?: string;
  address?: string;
  socialLinks?: Array<{
    _key: string;
    platformName: string;
    url: string;
  }>;
}

// Site Settings (Singleton)
export interface SiteSettings extends SanityDocument {
  title?: string;
  description?: string;
  coverImage?: CustomImage; // Use CustomImage for Sanity image objects
  logo?: CustomImage; // Use CustomImage for Sanity image objects
}
