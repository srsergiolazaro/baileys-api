import pino, { type Logger } from 'pino';

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
		target: 'pino-pretty',
		options: {
			colorize: true,
			translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
			ignore: 'pid,hostname',
			messageKey: 'msg',
			singleLine: false,
		},
	},
	formatters: {
		level: (label) => {
			return { level: label };
		},
	},
	hooks: {
		logMethod(inputArgs: any[], method) {
			if (inputArgs.length >= 1) {
				const arg1 = inputArgs[0] as any;
				const arg2 = inputArgs[1] as any;
				const msgFilter = 'Skipping deletion of non-existent pre-key';

				if (
					(typeof arg1 === 'string' && arg1.includes(msgFilter)) ||
					(typeof arg2 === 'string' && arg2.includes(msgFilter)) ||
					(typeof arg1 === 'object' && arg1?.msg && typeof arg1.msg === 'string' && arg1.msg.includes(msgFilter)) ||
					(typeof arg1 === 'object' && arg1?.err && typeof arg1.err === 'string' && arg1.err.includes(msgFilter))
				) {
					return;
				}
			}
			return method.apply(this, inputArgs as any);
		},
	},
}) as CustomLogger;
