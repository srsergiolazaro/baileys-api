import cors from "cors";
import swaggerUi from "swagger-ui-express";
import routes from "./routes";
import { init } from "./whatsapp";
import dotenv from "dotenv";
import swaggerSpec from "./swagger";
import express, { type Request, type Response } from "express";
dotenv.config();

console.log("🚀 Iniciando servidor... cargando configuraciones...");

const app = express();
console.log("✔️  Express inicializado");

app.use(cors());
console.log("✔️  CORS habilitado");

app.use(express.json());
// Middleware para capturar errores de sintaxis en JSON (evita que el servidor colapse por malformed JSON)
app.use((err: any, _req: Request, res: Response, next: any) => {
	if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
		console.error("❌ Error de sintaxis JSON detectado:", err.message);
		return res.status(400).json({ error: "Invalid JSON format in request body" });
	}
	next();
});
console.log("✔️  Middleware JSON habilitado");

// Manejo global de errores no capturados para evitar que el proceso muera
process.on("uncaughtException", (error) => {
	console.error("🔥 CRITICAL: Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("🌊 CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
});

// Configuración de Swagger UI
const swaggerUiOptions = {
	customCss: ".swagger-ui .topbar { display: none }",
	customSiteTitle: "API WhatsChat - Documentación",
	customfavIcon: "/favicon.ico",
	swaggerOptions: {
		persistAuthorization: true,
		docExpansion: "none",
		filter: true,
		defaultModelsExpandDepth: -1,
	},
};

console.log("✔️  Configuración de Swagger lista");

// Serve Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
console.log("✔️  Swagger UI montado en /api-docs");

// Endpoint para obtener swagger.json
app.get("/swagger.json", (_: Request, res: Response) => {
	console.log("📄 Petición recibida: /swagger.json");
	res.setHeader("Content-Type", "application/json");
	res.send(swaggerSpec);
});

app.use("/", routes);
console.log("✔️  Rutas principales cargadas");

// Health check endpoint for Coolify Watch Paths
app.get("/health", (_: Request, res: Response) => {
	res.status(200).send("OK");
});

app.all("*", (_: Request, res: Response) => {
	console.warn("⚠️ Ruta no encontrada");
	return res.status(404).json({ error: "URL not found" });
});

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);


console.log("🔧 Iniciando servidor...");

// Iniciar tarea de limpieza automática (Mensajes de solo los últimos 4 días)

// Initialize WhatsApp sessions
init().then(() => {
	console.log("✔️ Inicialización de sesiones completada");

	// Start server
	app.listen(port, host, () => {
		console.log(`✅ Server running at http://${host}:${port}`);
		console.log(`📚 API Docs available at http://${host}:${port}/api-docs`);
	});
}).catch((error) => {
	console.error("❌ Error durante la inicialización:", error);
	process.exit(1);
});
