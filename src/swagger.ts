import swaggerJsdoc from 'swagger-jsdoc';

const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || '3000';

const options: swaggerJsdoc.Options = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'API de WhatsChat',
			version: '1.0.0',
			description: 'Documentación de la API de WhatsChat',
			contact: {
				name: 'Soporte',
				email: 'soporte@whatschat.com',
			},
		},
		servers: [
			{
				url: `http://localhost:${port}`,
				description: 'Servidor de desarrollo local',
			},
			...(!isProduction
				? [
						{
							url: `http://localhost:${port}`,
							description: 'Servidor de desarrollo',
						},
					]
				: []),
			...(!isProduction
				? [
						{
							url: `http://${process.env.HOST || 'localhost'}:${port}`,
							description: 'Servidor de desarrollo (red)',
						},
					]
				: []),
			...(!isProduction
				? [
						{
							url: 'https://whatsapp.taptapp.xyz',
							description: 'Servidor de producción',
						},
					]
				: []),
			...(!isProduction
				? [
						{
							url: 'https://whs.taptapp.xyz',
							description: 'Servidor de producción',
						},
					]
				: []),
		],
		components: {
			securitySchemes: {
				ApiKeyAuth: {
					type: 'apiKey',
					in: 'header',
					name: 'x-api-key',
					description: 'API Key para autenticación',
				},
				SessionId: {
					type: 'apiKey',
					in: 'header',
					name: 'x-session-id',
					description: 'ID de sesión de WhatsApp',
				},
			},
		},
		security: [
			{
				ApiKeyAuth: [],
			},
			{
				SessionId: [],
			},
		],
	},
	apis: ['./src/routes/*.ts'], // archivos que contienen la documentación
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
