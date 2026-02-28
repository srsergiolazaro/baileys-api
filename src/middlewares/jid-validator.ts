import type { Request, Response, NextFunction } from 'express';

// Middleware para validar el JID (WhatsApp ID)
export default function jidValidator(req: Request, res: Response, next: NextFunction) {
	const { jid } = req.params;

	if (!jid) {
		return res.status(400).json({ error: 'JID is required' });
	}

	// Validación básica del formato JID
	const jidRegex = /^[0-9]+@(s\.whatsapp\.net|g\.us)$/;
	if (!jidRegex.test(jid)) {
		return res.status(400).json({ error: 'Invalid JID format' });
	}

	// Agregar el jid validado a appData
	req.appData.jid = jid;

	next();
}
