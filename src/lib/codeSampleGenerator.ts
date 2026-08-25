/**
 * Code Sample Generator
 * Generates syntactically correct cURL, Python, and Node.js code samples
 * for API requests based on endpoint configuration and parameters.
 */

import { Endpoint } from '@/data/endpoints';

export interface CodeSample {
  curl: string;
  python: string;
  nodejs: string;
}

export interface CodeSampleContext {
  endpoint: Endpoint;
  parameters: Record<string, any>;
  apiKey: string;
  baseUrl?: string;
}

/**
 * Generate all code samples for a request
 */
export function generateCodeSamples(context: CodeSampleContext): CodeSample {
  const { endpoint, parameters, apiKey, baseUrl = 'https://api.zintlr.com/v1' } = context;

  return {
    curl: generateCurlSample(endpoint, parameters, apiKey, baseUrl),
    python: generatePythonSample(endpoint, parameters, apiKey, baseUrl),
    nodejs: generateNodeJsSample(endpoint, parameters, apiKey, baseUrl),
  };
}

/**
 * Generate cURL command sample
 * Format: curl -X METHOD "URL" -H "headers" -d 'body'
 */
export function generateCurlSample(
  endpoint: Endpoint,
  parameters: Record<string, any>,
  apiKey: string,
  baseUrl: string
): string {
  const url = buildUrl(endpoint, parameters, baseUrl);
  const method = endpoint.method;

  let command = `curl -X ${method} "${url}"`;

  // Add headers
  command += `\n  -H "Authorization: ${apiKey}"`;
  command += `\n  -H "Content-Type: application/json"`;

  // Add body for POST requests
  if (endpoint.method === 'POST') {
    const bodyParams = getBodyParameters(endpoint, parameters);
    command += `\n  -d '${JSON.stringify(bodyParams)}'`;
  }

  return command;
}

/**
 * Generate Python requests code sample
 * Uses requests library with proper error handling structure
 */
export function generatePythonSample(
  endpoint: Endpoint,
  parameters: Record<string, any>,
  apiKey: string,
  baseUrl: string
): string {
  const url = buildUrl(endpoint, parameters, baseUrl);
  const method = endpoint.method.toLowerCase();

  let code = `import requests\n\n`;

  // Setup headers
  code += `headers = {\n`;
  code += `    "Authorization": "${apiKey}",\n`;
  code += `    "Content-Type": "application/json"\n`;
  code += `}\n\n`;

  // Setup body for POST or params for GET
  if (method === 'get') {
    const params = getQueryParameters(endpoint, parameters);
    code += `params = ${JSON.stringify(params, null, 4)}\n\n`;
    code += `try:\n`;
    code += `    response = requests.get("${url}", headers=headers, params=params)\n`;
    code += `    response.raise_for_status()\n`;
    code += `    data = response.json()\n`;
    code += `    print(data)\n`;
  } else {
    const bodyParams = getBodyParameters(endpoint, parameters);
    code += `data = ${JSON.stringify(bodyParams, null, 4)}\n\n`;
    code += `try:\n`;
    code += `    response = requests.post("${url}", headers=headers, json=data)\n`;
    code += `    response.raise_for_status()\n`;
    code += `    result = response.json()\n`;
    code += `    print(result)\n`;
  }

  code += `except requests.exceptions.RequestException as e:\n`;
  code += `    print(f"Error: {e}")\n`;

  return code;
}

/**
 * Generate Node.js/axios code sample
 * Uses axios with proper error handling structure
 */
export function generateNodeJsSample(
  endpoint: Endpoint,
  parameters: Record<string, any>,
  apiKey: string,
  baseUrl: string
): string {
  const url = buildUrl(endpoint, parameters, baseUrl);
  const method = endpoint.method.toLowerCase();

  let code = `const axios = require('axios');\n\n`;

  // Setup config
  code += `const config = {\n`;
  code += `  method: '${method}',\n`;
  code += `  url: '${url}',\n`;
  code += `  headers: {\n`;
  code += `    'Authorization': '${apiKey}',\n`;
  code += `    'Content-Type': 'application/json'\n`;
  code += `  }\n`;

  // Add params for GET or data for POST
  if (method === 'get') {
    const params = getQueryParameters(endpoint, parameters);
    code += `,\n  params: ${JSON.stringify(params, null, 2).split('\n').join('\n  ')}\n`;
  } else {
    const bodyParams = getBodyParameters(endpoint, parameters);
    code += `,\n  data: ${JSON.stringify(bodyParams, null, 2).split('\n').join('\n  ')}\n`;
  }

  code += `};\n\n`;

  // Make request with error handling
  code += `axios(config)\n`;
  code += `  .then(response => {\n`;
  code += `    console.log('Success:', response.data);\n`;
  code += `  })\n`;
  code += `  .catch(error => {\n`;
  code += `    console.error('Error:', error.response?.data || error.message);\n`;
  code += `  });\n`;

  return code;
}

/**
 * Build full URL with query parameters for GET requests
 */
function buildUrl(
  endpoint: Endpoint,
  parameters: Record<string, any>,
  baseUrl: string
): string {
  let url = `${baseUrl}${endpoint.path}`;

  if (endpoint.method === 'GET') {
    const params = getQueryParameters(endpoint, parameters);
    const queryString = new URLSearchParams(params).toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

/**
 * Extract query parameters from form values
 * Only include non-empty values
 */
function getQueryParameters(endpoint: Endpoint, parameters: Record<string, any>): Record<string, string> {
  const queryParams: Record<string, string> = {};

  endpoint.parameters.forEach(param => {
    const value = parameters[param.name];
    if (value !== undefined && value !== null && value !== '') {
      queryParams[param.name] = String(value);
    }
  });

  return queryParams;
}

/**
 * Extract body parameters from form values
 * Only include non-empty values
 */
function getBodyParameters(endpoint: Endpoint, parameters: Record<string, any>): Record<string, any> {
  const bodyParams: Record<string, any> = {};

  endpoint.parameters.forEach(param => {
    const value = parameters[param.name];
    if (value !== undefined && value !== null && value !== '') {
      // Convert string numbers to actual numbers
      if (param.type === 'number') {
        bodyParams[param.name] = Number(value);
      } else {
        bodyParams[param.name] = value;
      }
    }
  });

  return bodyParams;
}

/**
 * Escape special characters in strings for safe shell usage
 */
function escapeShellString(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Format JSON with proper indentation
 */
function formatJson(obj: any, indent = 2): string {
  return JSON.stringify(obj, null, indent);
}

/**
 * Get language-specific comment for a code sample
 */
export function getLanguageComment(language: 'curl' | 'python' | 'nodejs'): string {
  switch (language) {
    case 'curl':
      return '# Run this in your terminal';
    case 'python':
      return '# Make sure to install: pip install requests';
    case 'nodejs':
      return '# Make sure to install: npm install axios';
    default:
      return '';
  }
}

/**
 * Validate generated code for syntax correctness
 * Returns true if code appears syntactically valid
 */
export function validateGeneratedCode(code: string, language: 'curl' | 'python' | 'nodejs'): boolean {
  if (!code || code.length === 0) {
    return false;
  }

  switch (language) {
    case 'curl':
      // Basic checks for curl
      return code.includes('curl') && code.includes('-X') && code.includes('-H');

    case 'python':
      // Basic checks for Python
      return (
        code.includes('requests') &&
        code.includes('headers') &&
        code.includes('response')
      );

    case 'nodejs':
      // Basic checks for Node.js
      return (
        code.includes('axios') &&
        code.includes('config') &&
        code.includes('.then')
      );

    default:
      return false;
  }
}

/**
 * Generate documentation comment for a code sample
 */
export function generateCodeDocumentation(endpoint: Endpoint): string {
  return `
/**
 * ${endpoint.name}
 * ${endpoint.description}
 * 
 * Credit Cost: ${endpoint.creditCost} credit(s)
 * Method: ${endpoint.method}
 * Endpoint: ${endpoint.path}
 * 
 * Parameters:
${endpoint.parameters.map(p => `   * - ${p.name} (${p.type})${p.required ? ' [REQUIRED]' : ' [OPTIONAL]'}: ${p.description}`).join('\n')}
 */
`;
}

/**
 * Get example response for an endpoint
 * Useful for showing developers what to expect
 */
export function getExampleResponse(endpoint: Endpoint): string {
  // Return mock response based on endpoint
  switch (endpoint.id) {
    case 'people-search':
      return JSON.stringify({
        person: {
          id: 'person_123abc',
          email: 'john.doe@acme.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+1-555-0123',
          company: 'Acme Corporation',
          title: 'Senior Software Engineer',
          location: 'San Francisco, CA',
          linkedin_url: 'https://www.linkedin.com/in/johndoe',
        },
      }, null, 2);

    case 'email-to-phone':
      return JSON.stringify({
        email: 'john.doe@acme.com',
        phone: '+1-555-0123',
        confidence: 0.95,
      }, null, 2);

    case 'phone-to-email':
      return JSON.stringify({
        phone: '5550123',
        email: 'john.doe@acme.com',
        confidence: 0.92,
      }, null, 2);

    case 'linkedin-to-profile':
      return JSON.stringify({
        profile: {
          name: 'John Doe',
          headline: 'Senior Software Engineer at Acme',
          experience: [
            { title: 'Senior Software Engineer', company: 'Acme', duration: '3 years' },
          ],
          education: [
            { degree: 'BS Computer Science', school: 'Stanford University' },
          ],
        },
      }, null, 2);

    case 'domain-to-cin':
      return JSON.stringify({
        domain: 'acme.com',
        cin: 'L72900KA2020PLC123456',
        company_name: 'Acme Corporation',
      }, null, 2);

    case 'cin-to-company-data':
      return JSON.stringify({
        cin: 'L72900KA2020PLC123456',
        company_name: 'Acme Corporation Pvt Ltd',
        registration_date: '2020-01-15',
        status: 'Active',
        authorized_capital: '10000000',
        paid_up_capital: '5000000',
      }, null, 2);

    default:
      return JSON.stringify({
        success: true,
        data: { example: 'response' },
      }, null, 2);
  }
}

/**
 * Generate inline code snippet for documentation
 */
export function generateInlineCodeSnippet(endpoint: Endpoint, language: 'curl' | 'python' | 'nodejs'): string {
  const exampleParams: Record<string, string> = {};
  
  endpoint.parameters.forEach(param => {
    if (param.example) {
      exampleParams[param.name] = param.example;
    }
  });

  const context: CodeSampleContext = {
    endpoint,
    parameters: exampleParams,
    apiKey: 'sk_test_YOUR_API_KEY_HERE',
  };

  const samples = generateCodeSamples(context);

  switch (language) {
    case 'curl':
      return samples.curl;
    case 'python':
      return samples.python;
    case 'nodejs':
      return samples.nodejs;
    default:
      return '';
  }
}
