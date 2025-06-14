#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

const outputPath = path.join(process.cwd(), 'docs', 'swagger.json');

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TekParola SSO API',
      version: '1.0.0',
      description: 'Enterprise Single Sign-On System API Documentation',
      contact: {
        name: 'TekParola Team',
        email: 'support@tekparola.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.tekparola.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/models/*.ts',
    './src/config/swagger.ts',
  ],
};

async function generateSwagger() {
  try {
    console.log('🚀 Generating Swagger documentation...');
    
    // Generate swagger spec
    const swaggerSpec = swaggerJsdoc(swaggerOptions);
    
    // Ensure docs directory exists
    const docsDir = path.dirname(outputPath);
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    // Write swagger.json
    fs.writeFileSync(
      outputPath,
      JSON.stringify(swaggerSpec, null, 2),
      'utf-8'
    );
    
    console.log(`✅ Swagger documentation generated at: ${outputPath}`);
    
    // Also generate a markdown version
    const markdownPath = path.join(docsDir, 'api-endpoints.md');
    generateMarkdownDocs(swaggerSpec, markdownPath);
    
  } catch (error) {
    console.error('❌ Error generating Swagger documentation:', error);
    process.exit(1);
  }
}

function generateMarkdownDocs(spec: any, outputPath: string) {
  let markdown = '# TekParola SSO API Endpoints\n\n';
  markdown += `Version: ${spec.info.version}\n\n`;
  markdown += `${spec.info.description}\n\n`;
  
  // Group endpoints by tags
  const endpointsByTag: Record<string, any[]> = {};
  
  Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
    Object.entries(methods).forEach(([method, endpoint]: [string, any]) => {
      if (endpoint.tags) {
        endpoint.tags.forEach((tag: string) => {
          if (!endpointsByTag[tag]) {
            endpointsByTag[tag] = [];
          }
          endpointsByTag[tag].push({
            path,
            method: method.toUpperCase(),
            ...endpoint,
          });
        });
      }
    });
  });
  
  // Generate markdown for each tag group
  Object.entries(endpointsByTag).forEach(([tag, endpoints]) => {
    markdown += `## ${tag}\n\n`;
    
    endpoints.forEach((endpoint) => {
      markdown += `### ${endpoint.method} ${endpoint.path}\n`;
      markdown += `${endpoint.summary || 'No summary'}\n\n`;
      
      if (endpoint.description) {
        markdown += `**Description:** ${endpoint.description}\n\n`;
      }
      
      if (endpoint.parameters && endpoint.parameters.length > 0) {
        markdown += '**Parameters:**\n';
        endpoint.parameters.forEach((param: any) => {
          markdown += `- \`${param.name}\` (${param.in}): ${param.description || 'No description'}\n`;
        });
        markdown += '\n';
      }
      
      if (endpoint.requestBody) {
        markdown += '**Request Body:** Required\n\n';
      }
      
      if (endpoint.responses) {
        markdown += '**Responses:**\n';
        Object.entries(endpoint.responses).forEach(([code, response]: [string, any]) => {
          markdown += `- \`${code}\`: ${response.description || 'No description'}\n`;
        });
        markdown += '\n';
      }
      
      markdown += '---\n\n';
    });
  });
  
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`✅ Markdown documentation generated at: ${outputPath}`);
}

// Run the script
if (require.main === module) {
  generateSwagger();
}