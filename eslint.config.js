// eslint.config.js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
	// Configuración base recomendada de ESLint
	eslint.configs.recommended,

	// Configuración recomendada de TypeScript-ESLint
	// Esto reemplaza a los antiguos extends y plugins de TS
	...tseslint.configs.recommended,

	// ¡IMPORTANTE! Esta es la nueva forma de integrar Prettier.
	// Debe ser la ÚLTIMA configuración en el array para que pueda
	// sobreescribir y desactivar las reglas de estilo de los anteriores.
	prettierConfig,

	// Tu configuración personalizada
	{
		rules: {
			// Tus reglas de calidad de código se mantienen:
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-explicit-any": "off",
		},
		// Le decimos a ESLint qué archivos ignorar
		ignores: ["node_modules/", "dist/", "eslint.config.js", "prettier.config.js"],
	},
);
