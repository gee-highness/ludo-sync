// src/app/page.tsx
// This is a Server Component, no 'use client' directive

import { client, urlForImage } from '@/lib/sanity';
import { groq } from 'next-sanity';
import HomePageClient from '@/components/HomePageClient'; // Import the new client component
import { Metadata } from 'next';
import { Project, Service, SiteSettings } from '@/types/sanity'; // Import types from central types file

// Removed local interface definitions for Project, Service, SiteSettings
// They are now imported from '@/types/sanity' to ensure consistency.

// Metadata for the homepage
export const metadata: Metadata = {
  title: 'Synapse Digital - Crafting Cutting-Edge Software Solutions',
  description: 'Synapse Digital specializes in innovative software development, web applications, and digital transformation. Explore our projects and services.',
};

// Function to fetch all necessary data on the server
async function getHomePageData(): Promise<{
  projects: Project[];
  services: Service[];
  siteSettings: SiteSettings;
}> {
  const query = groq`
    {
      "projects": *[_type == "project"] | order(projectDate desc, _createdAt desc) [0...3]{
        _id,
        title,
        slug,
        tagline,
        mainImage,
        technologiesUsed,
        projectDate
      },
      "services": *[_type == "service"] | order(title asc){
        _id,
        title,
        description,
        slug,
        icon
        // If you want duration, price, and category, ensure they are in your service.ts schema:
        // duration,
        // price,
        // category->{_id, title}
      },
      "siteSettings": *[_type == "siteSettings"][0]{ title, description, coverImage, logo }
    }
  `;
  // Added { next: { revalidate: 60 } } for ISR
  const data = await client.fetch(query, {}, { next: { revalidate: 60 } });

  // Ensure siteSettings is an object, even if null from Sanity
  const siteSettings = data.siteSettings || {};

  // Process projects to include imageUrl
  const processedProjects = data.projects.map((project: Project) => ({
    ...project,
    imageUrl: project.mainImage ? urlForImage(project.mainImage).url() : undefined,
  }));

  // Process services to include imageUrl
  const processedServices = data.services.map((service: Service) => ({
    ...service,
    imageUrl: service.icon ? urlForImage(service.icon).url() : undefined,
  }));

  return {
    projects: processedProjects,
    services: processedServices,
    siteSettings: {
      ...siteSettings,
      coverImageUrl: siteSettings.coverImage ? urlForImage(siteSettings.coverImage).url() : undefined,
      logoUrl: siteSettings.logo ? urlForImage(siteSettings.logo).url() : undefined,
    },
  };
}

// Server component to fetch data and pass it to the client component
export default async function Page() {
  const { projects, services, siteSettings } = await getHomePageData();

  return (
    <HomePageClient
      //projects={projects}
      //services={services}
      //siteSettings={siteSettings}
    />
  );
}
