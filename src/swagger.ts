import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API de WhatsChat',
      version: '1.0.0',
      description: 'Documentación de la API de WhatsChat',
      contact: {
        name: 'Soporte',
        email: 'soporte@whatschat.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Servidor de desarrollo'
      },
      {
        url: 'https://whatsapp.taptapp.xyz',
        description: 'Servidor de producción'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      BearerAuth: []
    }]
  },
  apis: ['./src/routes/*.ts'] // archivos que contienen la documentación
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec; 