import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pokemon TCG Tracker API',
      version: '1.0.0',
      description: 'API documentation for Pokemon TCG Investment Tracker',
      contact: {
        name: 'API Support',
        email: 'support@tcgtracker.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://${env.host}:${env.port}`,
        description: 'Development server',
      },
      {
        url: 'https://api.tcgtracker.com',
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
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID',
            },
            username: {
              type: 'string',
              description: 'Username',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last update date',
            },
          },
        },
        Card: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Card ID',
            },
            name: {
              type: 'string',
              description: 'Card name',
            },
            set: {
              type: 'string',
              description: 'Set name',
            },
            number: {
              type: 'string',
              description: 'Card number',
            },
            rarity: {
              type: 'string',
              description: 'Card rarity',
            },
            price: {
              type: 'number',
              description: 'Current market price',
            },
          },
        },
        PriceAlert: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Alert ID',
            },
            user_id: {
              type: 'integer',
              description: 'User ID',
            },
            card_id: {
              type: 'string',
              description: 'Card ID',
            },
            target_price: {
              type: 'number',
              description: 'Target price for alert',
            },
            condition: {
              type: 'string',
              enum: ['above', 'below'],
              description: 'Price condition',
            },
            is_active: {
              type: 'boolean',
              description: 'Alert status',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Auth',
        description: 'Authentication endpoints',
      },
      {
        name: 'Cards',
        description: 'Card management endpoints',
      },
      {
        name: 'Prices',
        description: 'Price history and tracking endpoints',
      },
      {
        name: 'Alerts',
        description: 'Price alert endpoints',
      },
      {
        name: 'Vault',
        description: 'User card collection endpoints',
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);

