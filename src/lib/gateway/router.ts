/**
 * Gateway Router
 * Maps external REST paths to internal endpoint definitions.
 */

import { ENDPOINTS, Endpoint } from '@/data/endpoints';

export function resolveEndpoint(path: string): Endpoint | undefined {
  // path will be something like "/api/v1/people"
  // the endpoints.ts paths are like "/v1/people"
  
  // Strip "/api" prefix if present
  let normalizedPath = path;
  if (normalizedPath.startsWith('/api')) {
    normalizedPath = normalizedPath.substring(4);
  }

  return ENDPOINTS.find(ep => ep.path === normalizedPath);
}
