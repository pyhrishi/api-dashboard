import { NextResponse } from 'next/server';
import { ENDPOINTS } from '@/src/data/endpoints';
import { API_BASE_URL, API_SANDBOX_BASE_URL } from '@/lib/api-config';

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paths: Record<string, any> = {};

  ENDPOINTS.forEach((endpoint) => {
    const method = endpoint.method.toLowerCase();
    
    const parameters = endpoint.parameters.map((param) => {
      let type = 'string';
      let format = undefined;
      
      if (param.type === 'number') {
        type = 'integer';
      } else if (param.type === 'email') {
        format = 'email';
      }
      
      return {
        name: param.name,
        in: 'query',
        required: param.required,
        description: param.description,
        schema: {
          type,
          ...(format && { format }),
          ...(param.example && { example: param.example }),
          ...(param.maxLength && { maxLength: param.maxLength }),
          ...(param.minValue !== undefined && { minimum: param.minValue }),
          ...(param.maxValue !== undefined && { maximum: param.maxValue }),
        }
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestBody = method === 'post' ? {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            properties: endpoint.parameters.reduce((acc: any, param) => {
              let type = 'string';
              if (param.type === 'number') type = 'integer';
              
              acc[param.name] = {
                type,
                description: param.description,
                ...(param.example && { example: param.example })
              };
              return acc;
            }, {}),
            required: endpoint.parameters.filter(p => p.required).map(p => p.name)
          }
        }
      }
    } : undefined;

    paths[endpoint.path] = {
      [method]: {
        summary: endpoint.name,
        description: endpoint.description,
        operationId: endpoint.id,
        tags: ['Endpoints'],
        ...(method === 'get' ? { parameters } : { requestBody }),
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },
          '400': {
            description: 'Bad Request (e.g. validation error)'
          },
          '401': {
            description: 'Unauthorized (Invalid API Key)'
          },
          '429': {
            description: 'Rate Limit Exceeded'
          }
        }
      }
    };
  });

  const openapi = {
    openapi: '3.0.0',
    info: {
      title: 'zinbit by Zintlr',
      description: 'Comprehensive API reference for zinbit B2B data enrichment endpoints.',
      version: '1.0.0'
    },
    servers: [
      {
        url: API_BASE_URL,
        description: 'Live API Server'
      },
      {
        url: API_SANDBOX_BASE_URL,
        description: 'Sandbox Server'
      }
    ],
    paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key'
        }
      }
    },
    security: [
      {
        BearerAuth: []
      }
    ]
  };

  return NextResponse.json(openapi);
}
