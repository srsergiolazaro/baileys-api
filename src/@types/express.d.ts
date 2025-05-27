declare global {
	namespace Express {
		interface Request {
			appData: {
				sessionId: string;
				jid?: string;
				userId?: string;
			};
		}
	}
}

// Es importante que este archivo sea tratado como un módulo.
// Si no tienes ningún 'import' o 'export' en este archivo,
// TypeScript podría tratarlo como un script global y la aumentación no funcionaría.
// Para asegurar que se trate como un módulo, puedes añadir un export vacío si es necesario:
export {};
