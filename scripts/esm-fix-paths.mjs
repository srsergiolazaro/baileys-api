import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), "..");
const distRoot = path.join(root, "dist");

async function pathExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

function toPosix(p) {
	return p.replace(/\\/g, "/");
}

async function resolveSpecifier(dir, spec) {
	// ALIAS "@/..."
	if (spec.startsWith("@/")) {
		const targetBase = path.join(distRoot, spec.replace("@/", ""));
		return await resolveTarget(dir, targetBase);
	}

	// Relative imports "./" "../"
	if (spec.startsWith("./") || spec.startsWith("../")) {
		const targetBase = path.join(dir, spec);
		return await resolveTarget(dir, targetBase);
	}

	return spec;
}

async function resolveTarget(fromDir, targetBase) {
	// 1. Si existe archivo exacto (con extensión)
	if (await pathExists(targetBase)) {
		return toPosix(path.relative(fromDir, targetBase).replace(/^([^\.])/, "./$1"));
	}

	// 2. Si existe target.js
	if (!(targetBase.endsWith(".js"))) {
		const fileJs = targetBase + ".js";
		if (await pathExists(fileJs)) {
			return toPosix(path.relative(fromDir, fileJs).replace(/^([^\.])/, "./$1"));
		}
	}

	// 3. Si existe carpeta con index.js
	const indexJs = path.join(targetBase, "index.js");
	if (await pathExists(indexJs)) {
		return toPosix(path.relative(fromDir, indexJs).replace(/^([^\.])/, "./$1"));
	}

	// No encontrado — deja el spec original
	return toPosix(path.relative(fromDir, targetBase).replace(/^([^\.])/, "./$1"));
}

async function transformFile(file) {
	let code = await fs.readFile(file, "utf8");
	const dir = path.dirname(file);
	const regex = /(?<=from\s+['"])([^'"]+)(?=['"])|(?<=import\s*\(\s*['"])([^'"]+)(?=['"])/g;

	const matches = [...code.matchAll(regex)];

	for (const m of matches) {
		const original = m[0];
		const resolved = await resolveSpecifier(dir, original);

		if (original !== resolved) {
			code = code.replace(original, resolved);
		}
	}

	await fs.writeFile(file, code, "utf8");
}

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const e of entries) {
		const full = path.join(dir, e.name);

		if (e.isDirectory()) {
			await walk(full);
		}
		if (e.isFile() && full.endsWith(".js")) {
			await transformFile(full);
		}
	}
}

await walk(distRoot);
console.log("ESM path rewrite completed.");
