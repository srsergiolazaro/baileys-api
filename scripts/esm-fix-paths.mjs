import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al dist/
const distRoot = path.join(__dirname, "..", "dist");

// Regex
const aliasPattern = /(?<=from\s+['"])(@\/[^'"]+)(?=['"])/g;
const dynamicAliasPattern = /(?<=import\s*\(\s*['"])(@\/[^'"]+)(?=['"]\s*\))/g;

const relativePattern = /(?<=from\s+['"])(\.{1,2}\/[^'"]+)(?=['"])/g;
const dynamicRelativePattern = /(?<=import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(?=['"]\s*\))/g;

const exportAliasPattern = /(?<=export\s+\*\s+from\s+['"])(@\/[^'"]+)(?=['"])/g;
const exportRelativePattern = /(?<=export\s+\*\s+from\s+['"])(\.{1,2}\/[^'"]+)(?=['"])/g;

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

function toPosixRelative(from, to) {
	let rel = toPosix(path.relative(from, to));
	if (!rel.startsWith(".")) rel = "./" + rel;
	return rel;
}

function hasExtension(spec) {
	return /\.[a-z0-9]+$/i.test(spec);
}

async function resolveSpecifier(fileDir, spec) {
	// Alias "@/xxx"
	if (spec.startsWith("@/")) {
		const noAlias = spec.slice(2);
		let target = path.join(distRoot, noAlias);

		if (!await pathExists(target)) {
			if (await pathExists(target + ".js")) target = target + ".js";
			else if (await pathExists(path.join(target, "index.js")))
				target = path.join(target, "index.js");
			else return spec;
		}

		return toPosixRelative(fileDir, target);
	}

	// Relative imports "./" or "../"
	if (spec.startsWith(".")) {
		let target = path.join(fileDir, spec);

		if (!hasExtension(spec)) {
			if (await pathExists(target + ".js")) target = target + ".js";
			else if (await pathExists(path.join(target, "index.js")))
				target = path.join(target, "index.js");
			else return spec;
		}

		return toPosixRelative(fileDir, target);
	}

	return spec; // Otros no se tocan
}

async function transformFile(filePath) {
	let content = await fs.readFile(filePath, "utf8");
	const fileDir = path.dirname(filePath);

	async function replaceAll(pattern) {
		const matches = [...content.matchAll(pattern)];
		if (!matches.length) return;

		for (const match of matches) {
			const old = match[0];
			const resolved = await resolveSpecifier(fileDir, old);
			content = content.replace(old, resolved);
		}
	}

	await replaceAll(aliasPattern);
	await replaceAll(dynamicAliasPattern);
	await replaceAll(relativePattern);
	await replaceAll(dynamicRelativePattern);
	await replaceAll(exportAliasPattern);
	await replaceAll(exportRelativePattern);

	await fs.writeFile(filePath, content, "utf8");
}

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		const full = path.join(dir, e.name);

		if (e.isDirectory()) {
			await walk(full);
		} else if (e.isFile() && full.endsWith(".js")) {
			await transformFile(full);
		}
	}
}

async function main() {
	console.log("[esm-fix-paths] Iniciando reescritura ESM...");
	try {
		await walk(distRoot);
		console.log("[esm-fix-paths] COMPLETADO.");
	} catch (err) {
		console.error("[esm-fix-paths] ERROR:", err);
		process.exit(1);
	}
}

await main();
