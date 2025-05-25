import type { RequestHandler } from "express";
import {
	createSession,
	deleteSession,
	getSession,
	getSessionStatus,
	listSessions,
	sessionExists,
} from "@/whatsapp";

export const list: RequestHandler = (req, res) => {
	res.status(200).json(listSessions());
};

export const find: RequestHandler = (req, res) =>
	res.status(200).json({ message: "Session found" });

export const status: RequestHandler = (req, res) => {
	const session = getSession(req.appData.sessionId)!;
	res.status(200).json({ status: getSessionStatus(session) });
};

export const add: RequestHandler = async (req, res) => {
	const { sessionId, readIncomingMessages, ...socketConfig } = req.body;

	if (sessionExists(sessionId)) return res.status(400).json({ error: "Session already exists" });
	createSession({ sessionId, res, readIncomingMessages, socketConfig });
};

export const addSSE: RequestHandler = async (req, res) => {
	const { sessionId } = req.query;

	if (!sessionId || typeof sessionId !== 'string') {
		res.status(400).json({ error: "SessionId is required" });
		return;
	}

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	if (sessionExists(sessionId)) {
		res.write(`data: ${JSON.stringify({ error: "Session already exists" })}\n\n`);
		res.end();
		return;
	}
	createSession({ sessionId, res, SSE: true });
};

export const del: RequestHandler = async (req, res) => {
	await deleteSession(req.body.sessionId);
	res.status(200).json({ message: "Session deleted" });
};
