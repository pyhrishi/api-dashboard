import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { IpRule } from "./store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Basic IPv4 regex
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
// Very basic IPv6 regex (simplification)
const IPV6_REGEX = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

export function isValidIp(ip: string): boolean {
  return IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip);
}

export function isValidCidr(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const ip = parts[0];
  const mask = parseInt(parts[1], 10);
  
  if (!isValidIp(ip)) return false;
  
  if (IPV4_REGEX.test(ip)) {
    return mask >= 0 && mask <= 32;
  } else {
    return mask >= 0 && mask <= 128;
  }
}

export function isValidIpOrCidr(input: string): boolean {
  return isValidIp(input) || isValidCidr(input);
}

// Converts an IPv4 address to a 32-bit unsigned integer
function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isIpAllowed(ip: string, rules: IpRule[]): boolean {
  const activeRules = rules.filter(r => r.status === 'active');
  if (activeRules.length === 0) return true; // Default allow if no rules

  for (const rule of activeRules) {
    if (rule.ip === ip) return true; // Exact match

    // Check IPv4 CIDR match
    if (rule.ip.includes('/') && IPV4_REGEX.test(ip) && IPV4_REGEX.test(rule.ip.split('/')[0])) {
      const [subnetIp, maskStr] = rule.ip.split('/');
      const mask = parseInt(maskStr, 10);
      
      const ipLong = ipToLong(ip);
      const subnetLong = ipToLong(subnetIp);
      
      const maskLong = ~((1 << (32 - mask)) - 1) >>> 0;
      
      if ((ipLong & maskLong) === (subnetLong & maskLong)) {
        return true;
      }
    }
  }

  return false;
}

export const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' }
];

export function getCountryForIp(ip: string): string {
  // Deterministic mock resolution for frontend simulation
  const codes = COUNTRIES.map(c => c.code);
  let hash = 0;
  for (let i = 0; i < ip.length; i++) hash = (hash << 5) - hash + ip.charCodeAt(i);
  return codes[Math.abs(hash) % codes.length];
}

/** Human relative time ("just now", "5m ago", "3h ago", "2d ago") that never goes negative. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!isFinite(diff) || diff < 0) return 'just now';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
