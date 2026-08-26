/**
 * Gateway Data Privacy & Compliance Engine
 * Handles real-time payload redaction for DPDP, GDPR, and CCPA compliance.
 */

type PrivacyFramework = 'GDPR' | 'CCPA' | 'DPDP' | 'NONE';

export function detectPrivacyFramework(countryCode: string | null): PrivacyFramework {
  if (!countryCode) return 'NONE';
  
  const euCountries = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
  
  if (euCountries.includes(countryCode.toUpperCase())) return 'GDPR';
  if (countryCode.toUpperCase() === 'US-CA') return 'CCPA'; // Mocking California specifically
  if (countryCode.toUpperCase() === 'IN') return 'DPDP';
  
  return 'NONE';
}

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return `***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return '***';
  return `***-***-${phone.slice(-4)}`;
}

// Global Do-Not-Sell / Opt-Out Registry (Simulated Distributed Ledger)
const OptOutRegistry = new Set([
  'eve.jones@acme.com',      // Opted out via CCPA Do-Not-Sell
  'charlie.williams@acme.com' // Opted out via GDPR Right to be Forgotten
]);

export function enforceOptOutPropagation(data: any): { sanitizedData: any; optOutsRemoved: number } {
  let optOutsRemoved = 0;

  if (data === null || data === undefined) {
    return { sanitizedData: data, optOutsRemoved: 0 };
  }

  if (Array.isArray(data)) {
    const originalLength = data.length;
    const sanitizedArray = data.filter(item => {
      if (item && item.email && OptOutRegistry.has(item.email.toLowerCase())) {
        return false;
      }
      return true;
    }).map(item => {
      const result = enforceOptOutPropagation(item);
      optOutsRemoved += result.optOutsRemoved;
      return result.sanitizedData;
    });
    
    optOutsRemoved += (originalLength - sanitizedArray.length);
    return { sanitizedData: sanitizedArray, optOutsRemoved };
  }

  if (typeof data === 'object') {
    if (data.email && OptOutRegistry.has(data.email.toLowerCase())) {
      return { sanitizedData: null, optOutsRemoved: 1 };
    }

    const sanitizedObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const result = enforceOptOutPropagation(data[key]);
        sanitizedObj[key] = result.sanitizedData;
        optOutsRemoved += result.optOutsRemoved;
      }
    }
    return { sanitizedData: sanitizedObj, optOutsRemoved };
  }

  return { sanitizedData: data, optOutsRemoved: 0 };
}

export function applyPrivacyMasking(payload: any, framework: PrivacyFramework): any {
  if (framework === 'NONE' || !payload) return payload;

  // Deep clone to avoid mutating original cache/memory references
  const masked = JSON.parse(JSON.stringify(payload));

  const maskObject = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Redact PII based on framework strictness
        if (framework === 'GDPR' || framework === 'DPDP') {
          if (key.toLowerCase().includes('email')) {
            obj[key] = maskEmail(obj[key]);
          }
          if (key.toLowerCase().includes('phone')) {
            obj[key] = maskPhone(obj[key]);
          }
        } else if (framework === 'CCPA') {
          // CCPA specific logic (e.g. opt-out flag masking)
          if (key.toLowerCase().includes('email')) {
             obj[key] = maskEmail(obj[key]);
          }
        }
      } else if (typeof obj[key] === 'object') {
        maskObject(obj[key]);
      }
    }
  };

  maskObject(masked);
  return masked;
}
