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
const startGarbageCollector = () => {
	// Ejecutar cada 24 horas
	setInterval(async () => {
		try {
			console.log("🧹 Iniciando Garbage Collector de base de datos...");
			const { prisma } = await import("./db");
			const now = new Date();

			// 1. Limpiar sesiones de Signal (session-) inactivas > 120 días (Conservador)
			const sessionCutoff = new Date(now.getTime() - (120 * 24 * 60 * 60 * 1000));
			const deletedSessions = await prisma.session.deleteMany({
				where: {
					id: { startsWith: "session-" },
					updatedAt: { lt: sessionCutoff }
				}
			});

			// 2. Limpiar sender-keys antiguos > 90 días
			const senderKeyCutoff = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
			const deletedSenderKeys = await prisma.session.deleteMany({
				where: {
					id: { startsWith: "sender-key-" },
					updatedAt: { lt: senderKeyCutoff }
				}
			});

			console.log(`✅ GC completado: ${deletedSessions.count} sesiones y ${deletedSenderKeys.count} sender-keys eliminados.`);
		} catch (e) {
			console.error("❌ Error en Garbage Collector:", e);
		}
	}, 24 * 60 * 60 * 1000); // 24h
};

startGarbageCollector();

// Initialize WhatsApp sessions
init().then(() => {
	console.log("✔️ Inicialización de sesiones completada");

	// Start server
	const server = app.listen(port, host, () => {
		console.log(`✅ Server running at http://${host}:${port}`);
		console.log(`📚 API Docs available at http://${host}:${port}/api-docs`);
	});

	// ============================================================
	// 🛡️ MANEJO DE CIERRE ELEGANTE (Graceful Shutdown)
	// Asegura que las llaves en caché se guarden en DB antes de salir
	// ============================================================
	const gracefulShutdown = async (signal: string) => {
		console.log(`\n🛑 Recibida señal ${signal}. Iniciando apagado elegante...`);

		// 1. Cerrar servidor Express (dejar de aceptar nuevas peticiones)
		server.close(() => {
			console.log("✋ Servidor HTTP cerrado.");
		});

		try {
			// 2. Importar y ejecutar el flush de todas las sesiones
			const { flushAllSessions } = await import("./store");
			await flushAllSessions();
			console.log("💾 Caché de sesiones persistida correctamente.");

			console.log("👋 Apagado completado. Saliendo...");
			process.exit(0);
		} catch (error) {
			console.error("❌ Error durante el apagado:", error);
			process.exit(1);
		}
	};

	// ============================================================
	// 📊 MONITOR DE RENDIMIENTO (Memory Monitor)
	// Vital para detectar fugas de memoria en alta densidad (100+ sesiones)
	// ============================================================
	setInterval(() => {
		const used = process.memoryUsage();
		const sessionsCount = (global as any).sessionsMap?.size || 0;
		console.log(`\n📈 [System Monitor] - Sessions: ${sessionsCount}`);
		console.log(`   RSS: ${(used.rss / 1024 / 1024).toFixed(2)} MB`);
		console.log(`   Heap Total: ${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`);
		console.log(`   Heap Used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`);
		console.log(`   External: ${(used.external / 1024 / 1024).toFixed(2)} MB\n`);
	}, 5 * 60 * 1000); // Cada 5 minutos

	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

}).catch((error) => {
	console.error("❌ Error durante la inicialización:", error);
	process.exit(1);
});
