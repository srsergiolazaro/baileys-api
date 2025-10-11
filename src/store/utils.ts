import { toNumber } from "baileys";
import Long from "long";

/** Transform object props value into Prisma-supported types */
export function transformPrisma(data: any): any {
	if (data === null || data === undefined) return data;
	if (typeof data !== "object") return data;

	if (Array.isArray(data)) return data.map(transformPrisma);

	const base: any = {};
	for (const [key, val] of Object.entries(data)) {
		if (val instanceof Long || typeof val === "number") {
			base[key] = toNumber(val);
			continue;
		}
		if (val instanceof Uint8Array) {
			base[key] = Buffer.from(val.buffer);
			continue;
		}
		if (val instanceof Buffer) {
			base[key] = val;
			continue;
		}
		if (typeof val === "object") {
			base[key] = transformPrisma(val);
			continue;
		}
		base[key] = val;
	}

	return base;
}

/** Transform prisma result into JSON serializable types */
export function serializePrisma(data: any): any {
	if (data === null || data === undefined) return data;
	if (typeof data !== "object") return data;

	if (Array.isArray(data)) return data.map(serializePrisma);

	const base: any = {};
	for (const [key, val] of Object.entries(data)) {
		if (val instanceof Buffer) {
			base[key] = val.toString("base64");
			continue;
		}
		if (typeof val === "object") {
			base[key] = serializePrisma(val);
			continue;
		}
		base[key] = val;
	}

	return base;
}
