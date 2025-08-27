import pino, { type Logger } from "pino";

// Custom log method type that accepts metadata objects
type CustomLogger = Logger & {
  info: (msg: string, obj?: any) => void;
  error: (msg: string, obj?: any) => void;
  warn: (msg: string, obj?: any) => void;
  debug: (msg: string, obj?: any) => void;
};

export const logger: CustomLogger = pino({
	timestamp: () => `,"time":"${new Date().toJSON()}"`,
	transport: {
		targets: [
			{
				level: process.env.LOG_LEVEL || "debug",
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
					ignore: "pid,hostname",
				},
			},
		],
	},
	mixin(mergeObject, level) {
		return {
			...mergeObject,
			level: level,
		};
	},
}) as CustomLogger;
