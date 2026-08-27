#!/usr/bin/env node

import { intro, outro, text, select, spinner, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';

async function main() {
  intro(pc.inverse(' Zintlr API CLI '));

  // Parse arguments or start interactive
  const args = process.argv.slice(2);
  let apiKey = args.find(a => a.startsWith('--key='))?.split('=')[1] || process.env.ZINTLR_API_KEY;
  let endpointPath = args.find(a => !a.startsWith('--') && a !== 'test');

  if (!apiKey) {
    apiKey = await text({
      message: 'Enter your Zintlr API Key (sk_test_... or sk_live_...):',
      placeholder: 'sk_test_demo_key',
      validate(value) {
        if (!value) return 'API key is required';
      },
    });
    if (isCancel(apiKey)) { cancel('Operation cancelled'); return process.exit(0); }
  }

  // Define endpoints available for testing
  const endpoints = [
    { value: '/v1/people', label: 'People Search', method: 'GET', params: ['email'] },
    { value: '/v1/companies/employees', label: 'Company Employees', method: 'GET', params: ['domain'] },
    { value: '/v1/people/phone', label: 'Find Phone by Email', method: 'GET', params: ['email'] },
    { value: '/v1/identity/resolve', label: 'Universal Identity Resolution', method: 'GET', params: ['query'] },
    { value: '/v1/people/search/ai', label: 'People AI Search', method: 'POST', params: ['query'] }
  ];

  if (!endpointPath) {
    endpointPath = await select({
      message: 'Select an endpoint to test:',
      options: endpoints.map(e => ({ value: e.value, label: `${e.method} ${e.value} - ${e.label}` }))
    });
    if (isCancel(endpointPath)) { cancel('Operation cancelled'); return process.exit(0); }
  }

  const endpoint = endpoints.find(e => e.value === endpointPath) || endpoints[0];

  const parameters = {};
  for (const param of endpoint.params) {
    let paramVal = args.find(a => a.startsWith(`--${param}=`))?.split('=')[1];
    if (!paramVal) {
      paramVal = await text({
        message: `Enter value for ${param}:`,
        validate(value) {
          if (!value) return `${param} is required`;
        }
      });
      if (isCancel(paramVal)) { cancel('Operation cancelled'); return process.exit(0); }
    }
    parameters[param] = paramVal;
  }

  const s = spinner();
  s.start(`Calling ${endpoint.method} ${endpoint.value}...`);

  // Target local server since we are testing in development
  const baseUrl = 'http://localhost:3000/api';
  const url = new URL(`${baseUrl}${endpoint.value}`);
  
  if (endpoint.method === 'GET') {
    Object.entries(parameters).forEach(([key, val]) => url.searchParams.append(key, val));
  }

  try {
    const start = Date.now();
    const res = await fetch(url.toString(), {
      method: endpoint.method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: endpoint.method !== 'GET' ? JSON.stringify(parameters) : undefined
    });

    const data = await res.json();
    const duration = Date.now() - start;
    
    s.stop(`Completed in ${duration}ms`);

    console.log();
    if (res.ok) {
      console.log(pc.green(`✔ ${res.status} OK`));
    } else {
      console.log(pc.red(`✖ ${res.status} Error`));
    }
    
    console.log(pc.dim('Response:'));
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    s.stop('Request failed');
    console.error(pc.red(`Make sure your local dev server (npm run dev) is running on port 3000.`));
    console.error(pc.red(err.message));
  }

  outro(`Run ${pc.cyan('npx zintlr test')} to test another endpoint!`);
}

main().catch(console.error);
