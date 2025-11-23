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
console.log("✔️  Middleware JSON habilitado");

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

app.all("*", (_: Request, res: Response) => {
	console.warn("⚠️ Ruta no encontrada");
	return res.status(404).json({ error: "URL not found" });
});

import { startCluster } from "./cluster";

const host = process.env.HOST || "0.0.0.0";

console.log("🔧 Iniciando cluster...");

startCluster(async (workerId, totalWorkers) => {
	console.log(`🧵 [worker ${workerId}] iniciado. Total workers: ${totalWorkers}`);

	const port = Number(process.env.PORT);

	console.log(`🔍 [worker ${workerId}] ejecutando init()...`);
	await init(workerId, totalWorkers);
	console.log(`✔️ [worker ${workerId}] init() terminado`);

	app.listen(port, () => {
		console.log(`✅ [worker ${workerId}]: Server running at http://${host}:${port}`);
	});
});
