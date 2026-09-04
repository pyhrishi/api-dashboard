/**
 * Social profile discovery — deterministic mock (single source of truth).
 *
 * Given an email, discovers the person's professional social footprint across
 * platforms (LinkedIn, GitHub, X, Stack Overflow, Medium, personal site), each
 * with a handle, verification, per-platform confidence, and a follower/activity
 * signal. Fully deterministic per email so the UI never flickers. Builds on
 * `resolvePersonFromEmail` for the base identity and its LinkedIn/GitHub/X links.
 */

import { resolvePersonFromEmail } from '@/lib/person-resolver';

export type SocialPlatform =
  | 'LinkedIn'
  | 'GitHub'
  | 'X'
  | 'Stack Overflow'
  | 'Medium'
  | 'Personal site';

export interface SocialProfile {
  platform: SocialPlatform;
  handle: string;
  url: string;
  verified: boolean;
  confidence: number;
  /** Follower / reputation count where the platform has one. */
  followers?: number;
  headline?: string;
  /** The strongest profile for this person (drives the card title). */
  primary: boolean;
}

export interface SocialProvenance {
  field: string;
  source: string;
  signal: string;
  confidence: number;
}

export interface SocialDiscovery {
  email: string;
  full_name: string;
  profiles: SocialProfile[];
  platform_count: number;
  confidence: number;
  last_verified: string;
  provenance: SocialProvenance[];
}

/** FNV-1a — small deterministic string hash. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Slug that follows a marker segment in a URL, e.g. github.com/<slug>. */
function slugAfter(url: string, marker: string): string {
  const i = url.indexOf(marker);
  if (i === -1) return '';
  return url
    .slice(i + marker.length)
    .split(/[/?#]/)[0]
    .trim();
}

const clamp01 = (n: number) => Math.max(0, Math.min(0.99, Math.round(n * 100) / 100));

export function discoverSocialProfiles(rawEmail: string): SocialDiscovery | null {
  const person = resolvePersonFromEmail(rawEmail);
  if (!person) return null;

  const email = rawEmail.trim().toLowerCase();
  const h = hash(email);
  const profiles: SocialProfile[] = [];

  // LinkedIn — always present, the primary professional identity.
  const liHandle = slugAfter(person.linkedin_url, '/in/') || person.full_name.toLowerCase().replace(/\s+/g, '-');
  profiles.push({
    platform: 'LinkedIn',
    handle: liHandle,
    url: person.linkedin_url,
    verified: true,
    confidence: clamp01(0.9 + ((h >>> 2) % 8) / 100),
    followers: 500 + ((h >>> 3) % 7500),
    headline: `${person.title} · ${person.company}`,
    primary: true,
  });

  // GitHub — present when the resolver found a dev footprint.
  if (person.github_url) {
    profiles.push({
      platform: 'GitHub',
      handle: slugAfter(person.github_url, 'github.com/'),
      url: person.github_url,
      verified: ((h >>> 5) % 100) < 78,
      confidence: clamp01(0.78 + ((h >>> 6) % 15) / 100),
      followers: 10 + ((h >>> 7) % 1990),
      headline: 'Open-source contributor',
      primary: false,
    });
  }

  // X / Twitter — present when the resolver found a handle.
  if (person.twitter_url) {
    profiles.push({
      platform: 'X',
      handle: '@' + slugAfter(person.twitter_url, '.com/'),
      url: person.twitter_url,
      verified: ((h >>> 8) % 100) < 45,
      confidence: clamp01(0.62 + ((h >>> 9) % 22) / 100),
      followers: 80 + ((h >>> 10) % 14920),
      primary: false,
    });
  }

  // Stack Overflow — likely for developers (only when a GitHub profile exists).
  if (person.github_url && ((h >>> 11) % 100) < 55) {
    const soUser = slugAfter(person.github_url, 'github.com/');
    profiles.push({
      platform: 'Stack Overflow',
      handle: soUser,
      url: `https://stackoverflow.com/users/${(h >>> 12) % 9000000 + 100000}/${soUser}`,
      verified: false,
      confidence: clamp01(0.55 + ((h >>> 13) % 18) / 100),
      followers: 20 + ((h >>> 14) % 40000), // reputation
      headline: 'Reputation',
      primary: false,
    });
  }

  // Medium — occasional writer signal.
  if (((h >>> 15) % 100) < 30) {
    const mHandle = person.full_name.toLowerCase().replace(/\s+/g, '');
    profiles.push({
      platform: 'Medium',
      handle: '@' + mHandle,
      url: `https://medium.com/@${mHandle}`,
      verified: false,
      confidence: clamp01(0.5 + ((h >>> 16) % 15) / 100),
      followers: 30 + ((h >>> 17) % 5000),
      primary: false,
    });
  }

  // Personal site — occasional, no follower count.
  if (((h >>> 18) % 100) < 25) {
    const first = person.full_name.split(/\s+/)[0]?.toLowerCase() ?? 'me';
    const last = person.full_name.split(/\s+/).slice(-1)[0]?.toLowerCase() ?? '';
    const domain = `${first}${last}.dev`;
    profiles.push({
      platform: 'Personal site',
      handle: domain,
      url: `https://${domain}`,
      verified: ((h >>> 19) % 100) < 40,
      confidence: clamp01(0.48 + ((h >>> 20) % 20) / 100),
      primary: false,
    });
  }

  const platform_count = profiles.length;

  return {
    email,
    full_name: person.full_name,
    profiles,
    platform_count,
    confidence: person.confidence,
    last_verified: person.last_verified,
    provenance: [
      {
        field: 'linkedin',
        source: 'Social graph',
        signal: 'Handle + employer cross-match',
        confidence: 0.9,
      },
      {
        field: 'cross_platform',
        source: 'Username correlation',
        signal: `${platform_count} platform${platform_count === 1 ? '' : 's'} correlated to one identity`,
        confidence: clamp01(0.7 + platform_count * 0.04),
      },
      {
        field: 'activity',
        source: 'Public activity scan',
        signal: 'Recent public posts / commits confirm the accounts are live',
        confidence: 0.82,
      },
    ],
  };
}
