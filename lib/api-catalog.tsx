import { PhoneCall, Building2, SearchCheck, Fingerprint, MapPin, Landmark, FileCheck2, Globe2, Briefcase, MailSearch } from 'lucide-react';
import React from 'react';

export type ApiCategory = 'identity' | 'enrichment' | 'financial' | 'signals' | 'vehicle';

export interface CodeSnippets {
  curl: string;
  node: string;
  python: string;
}

export interface ApiEndpoint {
  id: string;
  categoryId: ApiCategory;
  name: string;
  icon: React.ReactNode;
  desc: string;
  snippets: CodeSnippets;
  response: string;
  latency: string;
}

export const CATEGORIES: { id: ApiCategory; name: string }[] = [
  { id: 'enrichment', name: 'B2B Enrichment' },
  { id: 'identity', name: 'Identity & KYC' },
  { id: 'financial', name: 'Financial Verification' },
  { id: 'signals', name: 'Signals & Webhooks' }
];

export const API_CATALOG: ApiEndpoint[] = [
  // CATEGORY: ENRICHMENT
  {
    id: 'email-to-phone',
    categoryId: 'enrichment',
    name: 'Reverse Email Lookup',
    icon: <PhoneCall className="w-4 h-4" />,
    desc: 'Input a corporate email, get a direct-dial phone number and contact profile.',
    latency: '85ms',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/b2b2b/v1/email-to-phone/ \\
  -H "Access-Token: sk_live_••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "emails": ["ceo@example.com"]
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/b2b2b/v1/email-to-phone/', {
  method: 'POST',
  headers: {
    'Access-Token': 'sk_live_••••••',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ emails: ['ceo@example.com'] })
});
const data = await response.json();`,
      python: `import requests

url = "https://api.zintlr.com/b2b2b/v1/email-to-phone/"
headers = {
    "Access-Token": "sk_live_••••••",
    "Content-Type": "application/json"
}
payload = { "emails": ["ceo@example.com"] }

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
    },
    response: `{
  "status": "success",
  "data": [
    {
      "email": "ceo@example.com",
      "person_name": "Jane Doe",
      "direct_dial": "+1 (555) 123-4567",
      "confidence_score": 0.99
    }
  ],
  "meta": { "credits_used": 1 }
}`
  },
  {
    id: 'domain-to-company',
    categoryId: 'enrichment',
    name: 'Domain to Company Info',
    icon: <Globe2 className="w-4 h-4" />,
    desc: 'Input a domain, get enriched firmographics (size, industry, revenue).',
    latency: '110ms',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/b2b2b/v1/domain-to-company/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{"domain": "stripe.com"}'`,
      node: `// Node.js implementation
const response = await fetch('https://api.zintlr.com/b2b2b/v1/domain-to-company/', {
  method: 'POST',
  headers: { 'Access-Token': 'sk_live_••••••' },
  body: JSON.stringify({ domain: 'stripe.com' })
});`,
      python: `# Python implementation
import requests
requests.post('https://api.zintlr.com/b2b2b/v1/domain-to-company/', 
  json={"domain": "stripe.com"}, 
  headers={"Access-Token": "sk_live_••••••"}
)`
    },
    response: `{
  "status": "success",
  "data": {
    "company_name": "Stripe",
    "industry": "Financial Services",
    "employee_count": 8500,
    "headquarters": "San Francisco, CA"
  }
}`
  },
  {
    id: 'person-search',
    categoryId: 'enrichment',
    name: 'Graph Search (People)',
    icon: <SearchCheck className="w-4 h-4" />,
    desc: 'Query 400M+ profiles using natural criteria (Title + Location).',
    latency: '145ms',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/b2b2b/v1/person-search/ \\
  -H "Access-Token: sk_live_••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "CTO",
    "location": "Bangalore"
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/b2b2b/v1/person-search/', {
  method: 'POST',
  headers: {
    'Access-Token': 'sk_live_••••••',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'CTO',
    location: 'Bangalore'
  })
});`,
      python: `import requests
payload = { "title": "CTO", "location": "Bangalore" }
response = requests.post("https://api.zintlr.com/b2b2b/v1/person-search/", json=payload, headers={"Access-Token": "sk_live_••••••"})`
    },
    response: `{
  "status": "success",
  "data": [
    {
      "name": "John Smith",
      "title": "CTO",
      "company": "TechCorp",
      "location": "Bangalore, India"
    }
  ],
  "meta": { "total_results": 1450 }
}`
  },
  
  // CATEGORY: IDENTITY & KYC
  {
    id: 'aadhaar-verify',
    categoryId: 'identity',
    name: 'Aadhaar Verification',
    icon: <Fingerprint className="w-4 h-4" />,
    desc: 'Verify Aadhaar via OTP or XML for seamless digital onboarding.',
    latency: '600ms',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/identity/v1/aadhaar/generate-otp/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{"aadhaar_number": "XXXX-XXXX-1234"}'`,
      node: `const response = await fetch('https://api.zintlr.com/identity/v1/aadhaar/generate-otp/', {
  method: 'POST',
  headers: { 'Access-Token': 'sk_live_••••••' },
  body: JSON.stringify({ aadhaar_number: 'XXXX-XXXX-1234' })
});`,
      python: `import requests
requests.post('https://api.zintlr.com/identity/v1/aadhaar/generate-otp/', 
  json={"aadhaar_number": "XXXX-XXXX-1234"}, 
  headers={"Access-Token": "sk_live_••••••"}
)`
    },
    response: `{
  "status": "success",
  "data": {
    "reference_id": "req_8f7d6a5b4c3d",
    "message": "OTP sent successfully to registered mobile number ending with 9876."
  }
}`
  },
  {
    id: 'pan-verify',
    categoryId: 'identity',
    name: 'PAN Comprehensive Check',
    icon: <FileCheck2 className="w-4 h-4" />,
    desc: 'Verify Permanent Account Number (PAN) details directly with NSDL.',
    latency: '300ms',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/identity/v1/pan/verify/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{"pan_number": "ABCDE1234F"}'`,
      node: `const response = await fetch('https://api.zintlr.com/identity/v1/pan/verify/', {
  method: 'POST',
  headers: { 'Access-Token': 'sk_live_••••••' },
  body: JSON.stringify({ pan_number: 'ABCDE1234F' })
});`,
      python: `import requests
requests.post('https://api.zintlr.com/identity/v1/pan/verify/', 
  json={"pan_number": "ABCDE1234F"}, 
  headers={"Access-Token": "sk_live_••••••"}
)`
    },
    response: `{
  "status": "success",
  "data": {
    "pan_number": "ABCDE1234F",
    "status": "VALID",
    "full_name": "JOHN DOE",
    "category": "Individual"
  }
}`
  },
  {
    id: 'domain-to-cin',
    categoryId: 'identity',
    name: 'MCA Verification (Domain to CIN)',
    icon: <Building2 className="w-4 h-4" />,
    desc: 'Input a domain, get verified MCA registry data (Corporate Identification).',
    latency: '250ms',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/identity/v1/domain-to-cin/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{"domain_list": ["example.in"]}'`,
      node: `const response = await fetch('https://api.zintlr.com/identity/v1/domain-to-cin/', {
  method: 'POST',
  headers: { 'Access-Token': 'sk_live_••••••' },
  body: JSON.stringify({ domain_list: ['example.in'] })
});`,
      python: `import requests
requests.post('https://api.zintlr.com/identity/v1/domain-to-cin/', 
  json={"domain_list": ["example.in"]}, 
  headers={"Access-Token": "sk_live_••••••"}
)`
    },
    response: `{
  "status": "success",
  "data": [
    {
      "domain": "example.in",
      "cin": "U72900KA2021PTC142000",
      "legal_name": "Example India Pvt Ltd",
      "status": "Active"
    }
  ]
}`
  },

  // CATEGORY: FINANCIAL
  {
    id: 'penny-drop',
    categoryId: 'financial',
    name: 'Bank Validation (Penny Drop)',
    icon: <Landmark className="w-4 h-4" />,
    desc: 'Verify bank account existence and account holder name by depositing ₹1.',
    latency: '1.2s',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/financial/v1/penny-drop/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{
    "account_number": "1234567890",
    "ifsc_code": "HDFC0001234"
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/financial/v1/penny-drop/', {
  method: 'POST',
  headers: { 'Access-Token': 'sk_live_••••••' },
  body: JSON.stringify({ account_number: '1234567890', ifsc_code: 'HDFC0001234' })
});`,
      python: `import requests
requests.post('https://api.zintlr.com/financial/v1/penny-drop/', 
  json={"account_number": "1234567890", "ifsc_code": "HDFC0001234"}, 
  headers={"Access-Token": "sk_live_••••••"}
)`
    },
    response: `{
  "status": "success",
  "data": {
    "account_exists": true,
    "name_at_bank": "JOHN DOE",
    "utr_number": "N1234567890123"
  }
}`
  },
  
  // CATEGORY: SIGNALS
  {
    id: 'funding-alert',
    categoryId: 'signals',
    name: 'Funding Event Webhook',
    icon: <Briefcase className="w-4 h-4" />,
    desc: 'Register a webhook to receive real-time alerts when targeted companies raise capital.',
    latency: 'Event',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/signals/v1/webhooks/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{
    "event": "company.funding_raised",
    "target_url": "https://your-server.com/webhooks/zintlr"
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/signals/v1/webhooks/', {
  method: 'POST',
  headers: { 'Access-Token': 'sk_live_••••••' },
  body: JSON.stringify({ 
    event: 'company.funding_raised', 
    target_url: 'https://your-server.com/webhooks/zintlr' 
  })
});`,
      python: `import requests
requests.post('https://api.zintlr.com/signals/v1/webhooks/', 
  json={"event": "company.funding_raised", "target_url": "https://your-server.com/webhooks/zintlr"}, 
  headers={"Access-Token": "sk_live_••••••"}
)`
    },
    response: `{
  "status": "success",
  "data": {
    "webhook_id": "wh_9x8y7z",
    "status": "active",
    "secret": "whsec_••••••••••••"
  }
}`
  }
];
