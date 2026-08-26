import React from 'react';
import { Terminal, Database, Cpu } from 'lucide-react';

export const BLOG_POSTS = [
  {
    slug: 'scaling-to-400m-identities',
    title: 'Scaling to 400M Identities: Our Journey from PostgreSQL to a Distributed Graph',
    excerpt: 'How we redesigned our core identity resolution engine to handle a 50x increase in dataset size while dropping p99 latency from 800ms to 120ms.',
    date: 'August 14, 2026',
    readTime: '8 min read',
    category: 'Architecture',
    icon: <Database className="w-5 h-5 text-teal" />,
    author: { name: 'Sarah Chen', role: 'Staff Engineer' }
  },
  {
    slug: 'p99-latency-across-global-edges',
    title: 'Achieving 120ms p99 Latency Across Global Edges',
    excerpt: 'A deep dive into our multi-region caching strategy, Anycast routing, and how we leverage edge compute to serve API requests closer to your servers.',
    date: 'July 02, 2026',
    readTime: '6 min read',
    category: 'Performance',
    icon: <Cpu className="w-5 h-5 text-teal" />,
    author: { name: 'Michael Rodriguez', role: 'Infrastructure Lead' }
  },
  {
    slug: 'real-time-webhook-dispatcher',
    title: 'The Architecture Behind our Real-time B2B Webhook Dispatcher',
    excerpt: 'Building a reliable, exactly-once delivery webhook system using Kafka and Redis. Handling backpressure, automatic retries, and cryptographic signature validation.',
    date: 'May 18, 2026',
    readTime: '10 min read',
    category: 'Engineering',
    icon: <Terminal className="w-5 h-5 text-teal" />,
    author: { name: 'David Kim', role: 'Backend Engineer' }
  },
  {
    slug: 'migrating-to-nextjs-14',
    title: 'Migrating the zinbit Console to Next.js 14 App Router',
    excerpt: 'Our experience transitioning from a legacy React SPA to the Next.js App Router for better SEO, server components, and performance.',
    date: 'April 05, 2026',
    readTime: '12 min read',
    category: 'Engineering',
    icon: <Terminal className="w-5 h-5 text-teal" />,
    author: { name: 'Alex Harper', role: 'Frontend Architect' }
  },
  {
    slug: 'introducing-zero-copy',
    title: 'Introducing Zero-Copy Data Sharing via Snowflake & BigQuery',
    excerpt: 'Stop building ETL pipelines for data enrichment. We are rolling out zero-copy integrations for seamless data sharing right in your warehouse.',
    date: 'March 22, 2026',
    readTime: '5 min read',
    category: 'Product',
    icon: <Database className="w-5 h-5 text-teal" />,
    author: { name: 'Rachel Singh', role: 'Product Manager' }
  }
];
