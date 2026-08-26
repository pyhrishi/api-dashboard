type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
}

const breakers = new Map<string, CircuitBreakerState>();

// Thresholds
const FAILURE_THRESHOLD = 3; // 3 consecutive failures trips the breaker
const COOLDOWN_MS = 30000; // 30 seconds cooldown before half-open

export function getCircuitState(serviceName: string): CircuitState {
  const cb = breakers.get(serviceName);
  if (!cb) return 'CLOSED';

  if (cb.state === 'OPEN') {
    if (Date.now() - cb.lastFailureTime > COOLDOWN_MS) {
      cb.state = 'HALF_OPEN';
      return 'HALF_OPEN';
    }
    return 'OPEN';
  }
  return cb.state;
}

export function recordSuccess(serviceName: string): void {
  breakers.set(serviceName, {
    state: 'CLOSED',
    failureCount: 0,
    lastFailureTime: 0,
  });
}

export function recordFailure(serviceName: string): void {
  let cb = breakers.get(serviceName);
  if (!cb) {
    cb = { state: 'CLOSED', failureCount: 0, lastFailureTime: 0 };
    breakers.set(serviceName, cb);
  }

  cb.failureCount += 1;
  cb.lastFailureTime = Date.now();

  if (cb.failureCount >= FAILURE_THRESHOLD) {
    cb.state = 'OPEN';
  }
}
