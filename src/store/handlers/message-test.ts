import { prisma } from '@/db';
import { filterPrisma, transformPrisma } from '@/store/utils';
import { Prisma } from '@prisma/client';

async function main() {
	console.log('📦 Obteniendo un mensaje de prueba...');
	const sampleMessage = await prisma.message.findFirst({
		orderBy: { pkId: 'desc' },
	});

	if (!sampleMessage) {
		console.log('❌ No hay mensajes en la base de datos.');
		return;
	}

	const { sessionId, remoteJid, id } = sampleMessage;
	console.log(`✅ Mensaje encontrado: ${id} de ${remoteJid}`);

	// 1. Verificar los campos que realmente se están guardando (no nulos)
	const nonNullFields = Object.entries(sampleMessage)
		.filter(([_, value]) => value !== null && value !== undefined && (Array.isArray(value) ? value.length > 0 : true))
		.map(([key]) => key);
	
	console.log('\n📊 Campos almacenados (no nulos/vacíos):');
	console.log(nonNullFields);

	// 2. Prueba de rendimiento: findFirst vs findUnique
	console.log('\n🚀 Iniciando prueba de rendimiento (100 iteraciones)...');
	
	const iterations = 100;
	
	// Prueba findFirst (Concurrente)
	console.log('🔄 Ejecutando findFirst concurrentemente...');
	const startFirst = performance.now();
	await Promise.all(
		Array.from({ length: iterations }).map(() =>
			prisma.message.findFirst({
				where: { sessionId, remoteJid, id },
				select: { pkId: true },
			})
		)
	);
	const endFirst = performance.now();

	// Prueba findUnique (Concurrente)
	console.log('⚡ Ejecutando findUnique concurrentemente...');
	const startUnique = performance.now();
	await Promise.all(
		Array.from({ length: iterations }).map(() =>
			prisma.message.findUnique({
				where: { sessionId_remoteJid_id: { sessionId, remoteJid, id } },
				select: { pkId: true },
			})
		)
	);
	const endUnique = performance.now();

	console.log(`\n⏱️  findFirst tardó:  ${(endFirst - startFirst).toFixed(2)} ms`);
	console.log(`⚡ findUnique tardó: ${(endUnique - startUnique).toFixed(2)} ms`);
	console.log(`📈 findUnique es ~${((endFirst - startFirst) / (endUnique - startUnique)).toFixed(2)}x más rápido`);

	// --- NUEVA PRUEBA: TRANSFORM VS FILTER ---
	console.log('\n🧠 Iniciando prueba de procesamiento SOTA (Filtro vs Transformación)...');
	
	const MESSAGE_KEYS = [
		'sessionId', 'remoteJid', 'id', 'key', 'message', 
		'messageTimestamp', 'status', 'participant', 'pushName', 
		'reactions', 'userReceipt'
	];

	// Creamos un dummy payload pesado simulando lo que envía Baileys
	const dummyPayload = {
		...sampleMessage,
		protocolMessage: { type: 'historySync', history: Array(500).fill({ massiveData: 'test' }) },
		messageStubParameters: Array(100).fill('parameters_for_protocol'),
		labels: Array(50).fill('labels_test_string'),
		userReceipt: [{ userJid: 'test', readTimestamp: 12345 }],
		pollUpdates: Array(100).fill({ pollUpdateMessageKey: { id: 'x' } }),
		statusPsa: { campaign: 'xyz', testDataArray: Array(200).fill(1) },
		mediaData: Buffer.alloc(1024 * 50), // 50KB simulado
	};

	const TRASFORM_ITERATIONS = 1000;

	// Método Viejo: Transformar todo, luego filtrar (Muy costoso)
	const startOld = performance.now();
	for(let i = 0; i < TRASFORM_ITERATIONS; i++) {
		const transformed = transformPrisma(dummyPayload);
		filterPrisma(transformed, MESSAGE_KEYS);
	}
	const endOld = performance.now();

	// Método Nuevo SOTA: Filtrar lo que sirve, luego transformar (Súper eficiente)
	const startNew = performance.now();
	for(let i = 0; i < TRASFORM_ITERATIONS; i++) {
		const filtered = filterPrisma(dummyPayload, MESSAGE_KEYS);
		transformPrisma(filtered);
	}
	const endNew = performance.now();

	console.log(`🐢 Método Viejo (Transform -> Filter): ${(endOld - startOld).toFixed(2)} ms`);
	console.log(`🚀 Método SOTA (Filter -> Transform): ${(endNew - startNew).toFixed(2)} ms`);
	console.log(`📈 SOTA es ~${((endOld - startOld) / (endNew - startNew)).toFixed(2)}x más rápido renderizando el objeto en memoria.`);

}

main();