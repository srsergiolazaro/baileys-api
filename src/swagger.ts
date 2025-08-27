import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: "API de WhatsChat",
			version: "1.0.0",
			description: "Documentación de la API de WhatsChat",
			contact: {
				name: "Soporte",
				email: "soporte@whatschat.com",
			},
		},
		servers: [
			{
				url: "http://localhost:3001",
				description: "Servidor de desarrollo",
			},
			{
				url: "https://whatsapp.taptapp.xyz",
				description: "Servidor de producción",
			},
		],
		components: {
			securitySchemes: {
				ApiKeyAuth: {
					type: "apiKey",
					in: "header",
					name: "x-api-key",
					description: "API Key para autenticación",
				},
				SessionId: {
					type: "apiKey",
					in: "header",
					name: "x-session-id",
					description: "ID de sesión de WhatsApp",
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
	apis: ["./src/routes/*.ts"], // archivos que contienen la documentación
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
