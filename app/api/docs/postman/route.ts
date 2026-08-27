import { NextResponse } from 'next/server';
import { ENDPOINTS } from '@/src/data/endpoints';

export async function GET() {
  const collection = {
    info: {
      name: "zinbit by Zintlr API",
      description: "Official Postman collection for the zinbit B2B Data Enrichment API.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    variable: [
      {
        key: "baseUrl",
        value: "https://api.zintlr.com",
        type: "string"
      },
      {
        key: "apiKey",
        value: "sk_test_YOUR_API_KEY_HERE",
        type: "string"
      }
    ],
    auth: {
      type: "bearer",
      bearer: [
        {
          key: "token",
          value: "{{apiKey}}",
          type: "string"
        }
      ]
    },
    item: ENDPOINTS.map((ep) => {
      // Build request body for POST/PUT, or query params for GET
      const urlParams = ep.parameters.map(param => ({
        key: param.name,
        value: param.example ? String(param.example) : "",
        description: param.description
      }));
      
      const query = ep.method === 'GET' ? urlParams : [];
      
      let body = undefined;
      if (ep.method !== 'GET') {
        const rawBody: any = {};
        ep.parameters.forEach(param => {
          rawBody[param.name] = param.example;
        });
        
        body = {
          mode: "raw",
          raw: JSON.stringify(rawBody, null, 2),
          options: {
            raw: {
              language: "json"
            }
          }
        };
      }

      return {
        name: ep.name,
        request: {
          method: ep.method,
          header: [
            {
              key: "Content-Type",
              value: "application/json"
            }
          ],
          body,
          url: {
            raw: `{{baseUrl}}${ep.path}${query.length > 0 ? '?' + query.map(q => `${q.key}=${encodeURIComponent(q.value)}`).join('&') : ''}`,
            host: [
              "{{baseUrl}}"
            ],
            path: ep.path.split('/').filter(Boolean),
            query
          },
          description: ep.description
        }
      };
    })
  };

  return NextResponse.json(collection);
}
