/**
 * Gateway Auth Validator
 * Validates API keys in incoming requests.
 */

export interface AuthResult {
  isValid: boolean;
  apiKey?: string;
  error?: string;
  errorCode?: string;
}

export function validateApiKey(authHeader: string | null): AuthResult {
  if (!authHeader) {
    return {
      isValid: false,
      error: 'Missing Authorization header',
      errorCode: 'UNAUTHORIZED',
    };
  }

  // Expecting "Bearer sk_..."
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return {
      isValid: false,
      error: 'Invalid Authorization header format. Expected "Bearer <API_KEY>"',
      errorCode: 'UNAUTHORIZED',
    };
  }

  const token = parts[1];

  // 1. JWT / OAuth 2.0 Token Support
  if (token.startsWith('eyJ')) {
    try {
      // Decode JWT payload (without verifying signature for prototype)
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) throw new Error('Invalid JWT structure');
      
      // Base64url to Base64 for atob (Edge Compatible)
      let base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) {
        base64 += '='.repeat(4 - pad);
      }
      const payloadString = atob(base64);
      const payload = JSON.parse(payloadString);

      // Map OAuth client_id or sub to an internal API Key
      const mappedApiKey = payload.client_id || payload.sub;
      if (!mappedApiKey) {
         throw new Error('Missing client_id or sub in JWT');
      }

      return { isValid: true, apiKey: mappedApiKey };
    } catch (err) {
      return {
        isValid: false,
        error: 'Invalid or malformed JWT token',
        errorCode: 'UNAUTHORIZED',
      };
    }
  }

  // 2. Standard API Key Support
  if (!token.startsWith('sk_test_') && !token.startsWith('sk_live_')) {
    return {
      isValid: false,
      error: 'Invalid API Key format. Must start with sk_test_, sk_live_, or be a valid JWT',
      errorCode: 'UNAUTHORIZED',
    };
  }

  return {
    isValid: true,
    apiKey: token,
  };
}
