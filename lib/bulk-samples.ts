/**
 * Deterministic sample datasets for Bulk Enrichment Jobs — lets a developer try a
 * bulk run in one click without preparing a file. Includes a few deliberately
 * invalid rows so the "skipped before billing" behavior is visible in the demo.
 */
import type { Endpoint } from '@/data/endpoints';

const FIRST = ['Priya', 'Arjun', 'Maya', 'Rohan', 'Ananya', 'Vikram', 'Sara', 'Kabir', 'Nina', 'Dev', 'Isha', 'Aarav', 'Zara', 'Ravi', 'Leah', 'Omar', 'Tara', 'Neil', 'Aisha', 'Kiran'];
const LAST = ['Sharma', 'Mehta', 'Iyer', 'Kapoor', 'Nair', 'Singh', 'Rao', 'Desai', 'Bose', 'Malik', 'Joshi', 'Reddy', 'Khan', 'Patel', 'Menon', 'Gupta', 'Das', 'Verma', 'Chopra', 'Bhatt'];
const COMPANIES: { name: string; domain: string }[] = [
  { name: 'Northwind Analytics', domain: 'northwind.io' }, { name: 'Helios Payments', domain: 'heliospay.com' },
  { name: 'Marigold Health', domain: 'marigoldhealth.com' }, { name: 'Kestrel Logistics', domain: 'kestrel.co' },
  { name: 'Lumen Robotics', domain: 'lumenrobotics.ai' }, { name: 'Saffron Labs', domain: 'saffronlabs.in' },
  { name: 'Orbital Freight', domain: 'orbitalfreight.com' }, { name: 'Bluefin Capital', domain: 'bluefin.vc' },
  { name: 'Cobalt Security', domain: 'cobaltsec.io' }, { name: 'Verdant Energy', domain: 'verdant.energy' },
];

export interface SamplePersona {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  company: string;
  domain: string;
  cin: string;
  din: string;
}

export const SAMPLE_SIZE = 40;

/** Deterministic personas; indexes 7, 19, 31 carry invalid values to exercise validation. */
export function samplePersonas(count = SAMPLE_SIZE): SamplePersona[] {
  const out: SamplePersona[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const co = COMPANIES[(i * 3) % COMPANIES.length];
    const slug = `${first}.${last}`.toLowerCase();
    const persona: SamplePersona = {
      first_name: first,
      last_name: last,
      email: `${slug}@${co.domain}`,
      phone: `+91 98${String(10000000 + i * 137).slice(0, 8)}`,
      linkedin_url: `https://www.linkedin.com/in/${slug.replace('.', '-')}-${100 + i}`,
      company: co.name,
      domain: co.domain,
      cin: `U72200KA20${String(10 + (i % 15)).padStart(2, '0')}PTC0${String(40000 + i * 91).padStart(5, '0')}`,
      din: String(1000000 + i * 3719).padStart(8, '0'),
    };
    if (i === 7) persona.email = 'not-an-email';           // invalid email → skipped
    if (i === 19) persona.phone = '12';                    // invalid phone → skipped
    if (i === 31) { persona.email = ''; persona.domain = ''; } // missing required → skipped
    out.push(persona);
  }
  return out;
}

/** Only GET endpoints with at least one required parameter make sense as row-per-request bulk jobs. */
export function isBulkEligible(endpoint: Endpoint): boolean {
  return endpoint.method === 'GET' && !endpoint.isDeprecated && endpoint.parameters.some(p => p.required);
}

/** Build a sample table whose columns match the endpoint's parameters. */
export function sampleRowsFor(endpoint: Endpoint): { columns: string[]; rows: Record<string, string>[] } {
  const personas = samplePersonas();
  const columns = endpoint.parameters.map(p => p.name);
  const rows = personas.map((p, i) => {
    const row: Record<string, string> = {};
    endpoint.parameters.forEach(param => {
      const n = param.name.toLowerCase();
      if (n.includes('email')) row[param.name] = p.email;
      else if (n.includes('phone')) row[param.name] = p.phone;
      else if (n.includes('linkedin')) row[param.name] = p.linkedin_url;
      else if (n.includes('domain') || n.includes('website')) row[param.name] = p.domain;
      else if (n === 'cin') row[param.name] = p.cin;
      else if (n === 'din') row[param.name] = p.din;
      else if (n.includes('first')) row[param.name] = p.first_name;
      else if (n.includes('last')) row[param.name] = p.last_name;
      else if (n.includes('company') || n.includes('name')) row[param.name] = p.company;
      else if (param.type === 'number') row[param.name] = param.required ? String(Math.min(param.maxValue ?? 25, 10 + (i % 15))) : '';
      else row[param.name] = param.required ? param.example : '';
    });
    return row;
  });
  return { columns, rows };
}
