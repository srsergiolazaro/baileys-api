import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), "..");
const distRoot = path.join(root, "dist");
const aliasPattern = /(?<=from\s+['"])(@\/[^'"]+)(?=['"])/g;
const dynamicAliasPattern = /(?<=import\s*\(\s*['"])(@\/[^'"]+)(?=['"]\s*\))/g;
const relativePattern = /(?<=from\s+['"])(\.{1,2}\/[^'"]+)(?=['"])/g;
const dynamicRelativePattern = /(?<=import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(?=['"]\s*\))/g;
const exportAliasPattern = /(?<=export\s+\*\s+from\s+['"])(@\/[^'"]+)(?=['"])/g;
const exportRelativePattern = /(?<=export\s+\*\s+from\s+['"])(\.{1,2}\/[^'"]+)(?=['"])/g;

async function pathExists(target) {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

function toPosixRelative(fromDir, target) {
	const relative = path.relative(fromDir, target).replace(/\\/g, "/");
	if (relative.startsWith("../") || relative.startsWith("./")) {
		return relative;
	}
	return `./${relative}`;
}

function ensureExtension(spec) {
	return /\.[a-z0-9]+$/i.test(spec);
}

async function resolveSpecifier(fileDir, spec) {
	if (spec.startsWith("@/")) {
		let target = path.join(distRoot, spec.slice(2));
		if (!(await pathExists(target))) {
			const candidateFile = `${target}.js`;
			if (await pathExists(candidateFile)) {
				target = candidateFile;
			} else {
				const candidateIndex = path.join(target, "index.js");
				if (await pathExists(candidateIndex)) {
					target = candidateIndex;
				} else {
					return spec;
				}
			}
			return toPosixRelative(fileDir, target);
		}
		return toPosixRelative(fileDir, target);
	}

	if (spec.startsWith("./") || spec.startsWith("../")) {
		if (ensureExtension(spec)) {
			return toPosixRelative(fileDir, path.join(fileDir, spec)).replace(/^\.\//, "./");
		}

		let target = path.join(fileDir, spec);
		if (!(await pathExists(target))) {
			const candidateFile = `${target}.js`;
			if (await pathExists(candidateFile)) {
				target = candidateFile;
			} else {
				const candidateIndex = path.join(target, "index.js");
				if (await pathExists(candidateIndex)) {
					target = candidateIndex;
				} else {
					return spec;
				}
			}
		}

		return toPosixRelative(fileDir, target);
	}

	return spec;
}

async function transformFile(filePath) {
	let content = await fs.readFile(filePath, "utf8");
	const dir = path.dirname(filePath);

	const replaceUsingPattern = async (pattern) => {
		const matches = [...content.matchAll(pattern)];
		if (matches.length === 0) return;

		const replacements = await Promise.all(
			matches.map(async (match) => ({
				index: match.index ?? 0,
				length: match[0].length,
				replacement: await resolveSpecifier(dir, match[0]),
			})),
		);

		let offset = 0;
		for (const { index, length, replacement } of replacements) {
			content =
				content.slice(0, index + offset) +
				replacement +
				content.slice(index + offset + length);
			offset += replacement.length - length;
		}
	};

	await replaceUsingPattern(aliasPattern);
	await replaceUsingPattern(dynamicAliasPattern);
	await replaceUsingPattern(relativePattern);
	await replaceUsingPattern(dynamicRelativePattern);
	await replaceUsingPattern(exportAliasPattern);
	await replaceUsingPattern(exportRelativePattern);

	await fs.writeFile(filePath, content, "utf8");
}

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(fullPath);
		} else if (entry.isFile() && entry.name.endsWith(".js")) {
			await transformFile(fullPath);
		}
	}
}

async function main() {
	try {
		await walk(distRoot);
	} catch (error) {
		console.error("Failed to rewrite ESM aliases", error);
		process.exitCode = 1;
	}
}

await main();
