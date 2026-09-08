import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidIp(ip: string): boolean {
  return IPV4_REGEX.test(ip);
}

export function isValidCidr(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2 || !isValidIp(parts[0])) return false;
  const mask = parseInt(parts[1], 10);
  return mask >= 0 && mask <= 32;
}

export function isValidIpOrCidr(input: string): boolean {
  return isValidIp(input) || isValidCidr(input);
}
