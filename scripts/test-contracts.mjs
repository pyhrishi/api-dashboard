import { test } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const API_KEY = 'sk_test_automated_testing';

// Tests the Universal Envelope Contract
async function fetchEndpoint(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);
  
  // We don't throw on error status codes, we return both for testing
  const data = await response.json().catch(() => null);
  
  return { response, data };
}

// ---------------------------------------------------------
// SUITE: Standard Response Envelope Contract
// ---------------------------------------------------------
test('API Contract: Standard Response Envelope (Success)', async (t) => {
  const { response, data } = await fetchEndpoint('/companies/employees?domain=acme.com');
  
  assert.equal(response.status, 200, 'Should return HTTP 200');
  assert.equal(response.headers.get('content-type'), 'application/json', 'Content-Type should be application/json');
  
  // Validate standard envelope shape
  assert.ok(data !== null, 'Response should be valid JSON');
  assert.equal(data.success, true, 'Envelope should contain success: true');
  assert.ok(data.data !== undefined, 'Envelope should contain a data object/array');
  
  // Validate metadata
  assert.ok(data.metadata !== undefined, 'Envelope should contain a metadata object');
  assert.ok(typeof data.metadata.requestId === 'string', 'metadata.requestId should be a string');
  assert.ok(typeof data.metadata.timestamp === 'number', 'metadata.timestamp should be a numeric UNIX timestamp');
  assert.ok(typeof data.metadata.processingTimeMs === 'number', 'metadata.processingTimeMs should be a number');
  
  // Validate headers match metadata
  assert.equal(response.headers.get('x-request-id'), data.metadata.requestId, 'X-Request-Id header should precisely match metadata.requestId');
});

test('API Contract: Standard Error Envelope (Failure)', async (t) => {
  const { response, data } = await fetchEndpoint('/companies/employees'); // Missing required 'domain' parameter
  
  assert.equal(response.status, 400, 'Should return HTTP 400 Bad Request for missing parameters');
  
  // Validate standard error envelope shape
  assert.equal(data.success, false, 'Envelope should contain success: false');
  assert.equal(data.data, undefined, 'Error envelope should NOT contain a data object');
  
  // Validate error object
  assert.ok(data.error !== undefined, 'Error envelope should contain an error object');
  assert.equal(data.error.code, 'INVALID_PARAMETERS', 'error.code should be INVALID_PARAMETERS');
  assert.ok(typeof data.error.message === 'string', 'error.message should be a descriptive string');
});

// ---------------------------------------------------------
// SUITE: Async Processing Contract
// ---------------------------------------------------------
test('API Contract: Async Processing (202 Accepted)', async (t) => {
  const response = await fetch(`${API_BASE_URL}/companies/employees?domain=acme.com`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Prefer': 'respond-async'
    }
  });
  
  const data = await response.json();
  
  assert.equal(response.status, 202, 'Should return HTTP 202 Accepted when Prefer: respond-async is sent');
  assert.equal(data.success, true);
  assert.ok(typeof data.data.job_id === 'string', 'Async response data should contain a job_id');
  assert.equal(data.data.status, 'pending', 'Async job status should be pending');
  assert.ok(data.data.status_url.includes(data.data.job_id), 'Async response should provide a status_url containing the job_id');
});

// ---------------------------------------------------------
// SUITE: Idempotency Contract
// ---------------------------------------------------------
test('API Contract: Idempotency Guarantees', async (t) => {
  const idempotencyKey = `idemp_${Date.now()}`;
  
  // First request
  const req1 = await fetch(`${API_BASE_URL}/batch/companies/enrich`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ domains: ['acme.com'] })
  });
  
  assert.equal(req1.status, 200);
  assert.equal(req1.headers.has('x-idempotency-replayed'), false, 'First request should NOT be replayed');

  // Exact duplicate request using the same key
  const req2 = await fetch(`${API_BASE_URL}/batch/companies/enrich`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ domains: ['acme.com'] })
  });
  
  assert.equal(req2.status, 200);
  assert.equal(req2.headers.get('x-idempotency-replayed'), 'true', 'Second request SHOULD be replayed and cached');
  
  const data1 = await req1.json();
  const data2 = await req2.json();
  
  assert.deepEqual(data1.data, data2.data, 'Replayed payload should be deeply identical to original payload');
});

// ---------------------------------------------------------
// SUITE: Identity Resolution Structure
// ---------------------------------------------------------
test('API Contract: Identity Resolution Polymorphism', async (t) => {
  const { data: emailData } = await fetchEndpoint('/identity/resolve?query=john@acme.com');
  assert.equal(emailData.data.type, 'person', 'Email resolution should return type: person');
  assert.equal(emailData.data.resolved_from, 'email');
  assert.ok(emailData.data.profile.id.startsWith('pers_'), 'Profile ID should use pers_ prefix');

  const { data: domainData } = await fetchEndpoint('/identity/resolve?query=acme.com');
  assert.equal(domainData.data.type, 'company', 'Domain resolution should return type: company');
  assert.equal(domainData.data.resolved_from, 'domain');
  assert.ok(domainData.data.profile.id.startsWith('comp_'), 'Profile ID should use comp_ prefix');
});
