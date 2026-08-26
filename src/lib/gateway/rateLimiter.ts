/**
 * Gateway Rate Limiter
 * Simple in-memory rate limiter for Edge environments.
 * 
 * Note: In production, this would use Redis (e.g., Upstash).
 * For this sandbox, we use a basic Map. In a true serverless edge environment,
 * this Map may reset per-isolate, but it's sufficient for sandbox testing.
 */

interface RateLimitData {
  tokens: number;
  lastRefillTime: number;
}

// Store rate limits by API Key
const store = new Map<string, RateLimitData>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export function checkRateLimit(apiKey: string): RateLimitResult {
  const now = Date.now();
  
  // Token Bucket Configuration
  const capacity = 100; // Maximum burst capacity
  const refillRatePerMinute = 100; 
  const refillRatePerMs = refillRatePerMinute / 60000;

  let currentData = store.get(apiKey);

  if (!currentData) {
    // Initial request: bucket is full
    currentData = {
      tokens: capacity,
      lastRefillTime: now,
    };
  } else {
    // Refill bucket based on time passed
    const timePassed = now - currentData.lastRefillTime;
    const tokensToAdd = timePassed * refillRatePerMs;
    currentData.tokens = Math.min(capacity, currentData.tokens + tokensToAdd);
    currentData.lastRefillTime = now;
  }

  // Calculate time until next token (if bucket is empty) or time until full (if bucket not full)
  // Since we don't have a fixed window, we'll use the time until the bucket is completely full for 'reset'
  // to somewhat comply with standard rate limit headers, or time until 1 token is available.
  const msUntilFull = (capacity - currentData.tokens) / refillRatePerMs;
  const resetTimestamp = Math.floor((now + msUntilFull) / 1000);

  if (currentData.tokens >= 1) {
    // Consume a token
    currentData.tokens -= 1;
    store.set(apiKey, currentData);

    return {
      success: true,
      limit: capacity,
      remaining: Math.floor(currentData.tokens),
      reset: resetTimestamp,
    };
  } else {
    // Rate limited
    store.set(apiKey, currentData); // Update lastRefillTime but don't consume

    // If rate limited, 'reset' is time until we get at least 1 token
    const msUntilNextToken = (1 - currentData.tokens) / refillRatePerMs;
    const nextTokenTimestamp = Math.floor((now + msUntilNextToken) / 1000);

    return {
      success: false,
      limit: capacity,
      remaining: 0,
      reset: nextTokenTimestamp,
    };
  }
}
