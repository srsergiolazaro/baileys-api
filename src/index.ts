import cors from "cors";
import swaggerUi from "swagger-ui-express";
import routes from "./routes";
import { init } from "./whatsapp";
import dotenv from "dotenv";
import swaggerSpec from "./swagger";
import express, { type Request, type Response } from "express";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Swagger UI
const swaggerUiOptions = {
	customCss: ".swagger-ui .topbar { display: none }",
	customSiteTitle: "API WhatsChat - Documentación",
	customfavIcon: "/favicon.ico",
	swaggerOptions: {
		persistAuthorization: true,
		docExpansion: "none" as const,
		filter: true,
		defaultModelsExpandDepth: -1,
	},
} as const;

// Serve Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Endpoint para obtener la especificación de Swagger en formato JSON
app.get("/swagger.json", (req: Request, res: Response) => {
	res.setHeader("Content-Type", "application/json");
	res.send(swaggerSpec);
});

app.use("/", routes);

app.all("*", (_: Request, res: Response) => res.status(404).json({ error: "URL not found" }));

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

(async () => {
	await init();
	app.listen(port, () => {
		console.log(`[server]: Server is running at http://${host}:${port}`);
		console.log(`[docs]: API documentation available at http://${host}:${port}/api-docs`);
	});
})();
