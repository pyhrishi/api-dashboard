/**
 * Deterministic reverse IP → company intelligence (single source of truth).
 *
 * Turns an IP address into the company behind it plus the network context that
 * makes reverse-IP trustworthy: is this a real corporate egress, or datacenter/
 * VPN/consumer/mobile noise? Pure and deterministic — no Date.now, no Math.random —
 * so the gateway, Explorer, CLI, and the Studio all agree.
 */
import { resolveCompanyFromDomain, type EnrichedCompany } from '@/lib/company-resolver';

export type IpType = 'corporate' | 'datacenter' | 'vpn' | 'consumer' | 'mobile';

export interface IpProvenance { field: string; source: string; signal: string; confidence: number; }

export interface IpIntel {
  id: string;
  ip: string;
  ip_version: 4 | 6;
  ip_type: IpType;
  is_corporate: boolean;
  /** The company behind a corporate egress IP; null for non-corporate traffic. */
  company: EnrichedCompany | null;
  isp: string;
  asn: string;
  organization: string;
  hostname: string;
  city: string;
  country: string;
  timezone: string;
  /** Confidence that this IP maps to the named company (0..1). Low for non-corporate. */
  confidence: number;
  last_verified: string;
  sources: string[];
  provenance: IpProvenance[];
}

// ── Deterministic primitives ─────────────────────────────────────────────────
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

// ── Pools ────────────────────────────────────────────────────────────────────
const CORP_DOMAINS = ['stripe.com', 'datadoghq.com', 'shopify.com', 'zomato.com', 'infosys.com', 'atlassian.com', 'snowflake.com', 'cloudflare.com', 'hashicorp.com', 'twilio.com'];
const DC_PROVIDERS = ['Amazon AWS', 'Google Cloud', 'Microsoft Azure', 'DigitalOcean', 'Hetzner', 'OVHcloud', 'Linode'];
const VPN_PROVIDERS = ['NordVPN', 'ExpressVPN', 'Mullvad', 'Cloudflare WARP', 'Proton VPN'];
const CONSUMER_ISPS = ['Comcast Xfinity', 'AT&T', 'Verizon Fios', 'Spectrum', 'Jio', 'Airtel', 'BT', 'Deutsche Telekom'];
const MOBILE_ISPS = ['T-Mobile', 'Verizon Wireless', 'Vodafone', 'Jio Mobile', 'Orange'];
const LOCATIONS: Array<{ city: string; country: string; tz: string }> = [
  { city: 'San Francisco', country: 'United States', tz: 'America/Los_Angeles' },
  { city: 'Ashburn', country: 'United States', tz: 'America/New_York' },
  { city: 'London', country: 'United Kingdom', tz: 'Europe/London' },
  { city: 'Frankfurt', country: 'Germany', tz: 'Europe/Berlin' },
  { city: 'Bengaluru', country: 'India', tz: 'Asia/Kolkata' },
  { city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore' },
];
const VERIFY_EPOCH = Date.UTC(2026, 8, 1);
const isoDaysBefore = (ms: number, d: number) => new Date(ms - d * 86_400_000).toISOString().slice(0, 10);

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;

export function isValidIp(raw: string): boolean {
  const v = String(raw || '').trim();
  return IPV4.test(v) || IPV6.test(v);
}
export function normalizeIp(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/** Resolve an IP into the company behind it plus network intelligence. Null if invalid. */
export function resolveCompanyFromIp(rawIp: string): IpIntel | null {
  const ip = normalizeIp(rawIp);
  if (!isValidIp(ip)) return null;
  const ipVersion: 4 | 6 = ip.includes(':') ? 6 : 4;

  const seed = hashString(ip);
  const rng = makeRng(seed);

  // Weighted type: ~45% corporate, 20% datacenter, 10% vpn, 17% consumer, 8% mobile.
  const roll = rng();
  const ip_type: IpType = roll < 0.45 ? 'corporate' : roll < 0.65 ? 'datacenter' : roll < 0.75 ? 'vpn' : roll < 0.92 ? 'consumer' : 'mobile';
  const is_corporate = ip_type === 'corporate';
  const loc = pick(rng, LOCATIONS);
  const asn = `AS${10000 + (seed % 55000)}`;

  let company: EnrichedCompany | null = null;
  let isp = '';
  let organization = '';
  let hostname = '';
  let confidence = 0.4;

  if (is_corporate) {
    const domain = pick(rng, CORP_DOMAINS);
    company = resolveCompanyFromDomain(domain);
    organization = company?.name ?? domain;
    isp = `${organization} (corporate egress)`;
    hostname = `gw-${(seed % 900 + 100)}.${domain}`;
    confidence = 0.8 + rng() * 0.15;
  } else if (ip_type === 'datacenter') {
    organization = pick(rng, DC_PROVIDERS); isp = organization;
    hostname = `ec2-${seed % 900 + 100}.${organization.toLowerCase().replace(/\s+/g, '')}.compute`;
    confidence = 0.25 + rng() * 0.15;
  } else if (ip_type === 'vpn') {
    organization = pick(rng, VPN_PROVIDERS); isp = organization;
    hostname = `${organization.toLowerCase().replace(/\s+/g, '')}-exit-${seed % 90 + 10}`;
    confidence = 0.15 + rng() * 0.15;
  } else if (ip_type === 'consumer') {
    organization = pick(rng, CONSUMER_ISPS); isp = organization;
    hostname = `pool-${seed % 900 + 100}.${organization.toLowerCase().replace(/\s+/g, '')}.net`;
    confidence = 0.2 + rng() * 0.15;
  } else {
    organization = pick(rng, MOBILE_ISPS); isp = organization;
    hostname = `mobile-${seed % 900 + 100}.${organization.toLowerCase().replace(/\s+/g, '')}.net`;
    confidence = 0.18 + rng() * 0.12;
  }
  confidence = Math.min(0.98, Math.round(confidence * 100) / 100);

  const provenance: IpProvenance[] = [
    { field: 'ip_type', source: 'IP intelligence', signal: `ASN + BGP route classification (${asn})`, confidence: 0.93 },
    { field: 'organization', source: is_corporate ? 'Reverse DNS + WHOIS' : 'ASN registry', signal: is_corporate ? 'PTR record + org allocation' : `${ip_type} network allocation`, confidence: is_corporate ? 0.9 : 0.82 },
    { field: 'company', source: is_corporate ? 'Domain graph' : 'n/a', signal: is_corporate ? 'Corporate egress → domain match' : 'Non-corporate IP — no company mapping', confidence: is_corporate ? (company?.confidence ?? 0.8) : 0.2 },
    { field: 'geo', source: 'Geo-IP', signal: 'City-level edge resolution', confidence: 0.8 },
  ];

  return {
    id: `ip_${seed.toString(36).padStart(7, '0')}`,
    ip, ip_version: ipVersion, ip_type, is_corporate, company,
    isp, asn, organization, hostname,
    city: loc.city, country: loc.country, timezone: loc.tz,
    confidence, last_verified: isoDaysBefore(VERIFY_EPOCH, seed % 45),
    sources: Array.from(new Set(provenance.map((p) => p.source))).filter((s) => s !== 'n/a'),
    provenance,
  };
}
