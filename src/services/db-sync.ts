import { jidDecode } from 'baileys';
import { prisma, withPrismaRetry } from '../db';
import { logger } from '../shared';
import { AccountType } from '@prisma/client';

export function setupDbSyncHandlers(socket: any, sessionId: string) {
	// ============================================================
	// 🆔 EVENTOS DE IDENTIDAD (LID & Contacts)
	// Según recomendación: Vincular PN con LID para evitar duplicados.
	// ============================================================
	socket.ev.on('lid-mapping.update', async (mapping: { pn: string; lid: string }) => {
		const { pn, lid } = mapping;
		logger.info({ pn, lid, sessionId }, 'LID mapping received, syncing identity in DB');
		try {
			await prisma.$transaction(async (tx) => {
				// 1. Actualizar la sesión del usuario si el PN o LID coincide con la sesión actual
				const currentMe = socket.user;
				if (currentMe?.id) {
					const decoded = jidDecode(currentMe.id);
					const userPart = decoded?.user;
					if (userPart && (pn.includes(userPart) || lid.includes(userPart))) {
						await tx.userSession.update({
							where: { sessionId },
							data: {
								phoneNumber: pn,
								updatedAt: new Date(),
							},
						});
					}
				}

				// 2. Vincular Contactos: Si existe un contacto con este PN, añadirle el LID (y viceversa)
				await tx.contact.updateMany({
					where: {
						sessionId,
						OR: [{ id: pn }, { id: lid }, { phoneNumber: pn }, { lid: lid }],
					},
					data: { phoneNumber: pn, lid: lid },
				});

				// 3. Vincular Chats: Lo mismo para la tabla de chats
				await tx.chat.updateMany({
					where: {
						sessionId,
						OR: [{ id: pn }, { id: lid }, { pnJid: pn }, { lidJid: lid }],
					},
					data: { pnJid: pn, lidJid: lid },
				});
			});
		} catch (e) {
			logger.error('Failed to sync identity mapping', { sessionId, error: e });
		}
	});

	socket.ev.on('contacts.upsert', async (contacts: any[]) => {
		try {
			const validContacts = contacts.filter((c) => c.id);
			if (validContacts.length === 0) return;

			logger.info({ sessionId, count: validContacts.length }, 'Bulk syncing contacts');

			// Procesar en lotes de 200 para no ahogar Prisma ni la BD (Enterprise Ready)
			const CHUNK_SIZE = 200;
			for (let i = 0; i < validContacts.length; i += CHUNK_SIZE) {
				const chunk = validContacts.slice(i, i + CHUNK_SIZE);

				await prisma.$transaction(
					chunk.map((contact) =>
						prisma.contact.upsert({
							where: { sessionId_id: { sessionId, id: contact.id } },
							update: {
								name: contact.name || contact.notify || contact.verifiedName,
								phoneNumber: contact.phoneNumber,
								lid: contact.lid,
							},
							create: {
								sessionId,
								id: contact.id,
								name: contact.name || contact.notify || contact.verifiedName,
								phoneNumber: contact.phoneNumber,
								lid: contact.lid,
							},
						}),
					),
				);
			}
		} catch (e) {
			logger.error({ sessionId, err: e }, 'Failed to bulk sync contacts');
		}
	});
}

/**
 * Sincroniza el estado de la sesión de usuario en la base de datos con la información obtenida del socket.
 * Incluye detección de cuentas de empresa (business profile).
 */
export async function syncUserSessionToDb(
	sessionId: string,
	socket: any,
	userId: string,
	deviceName: string,
	socketConfig: any,
	readIncomingMessages: boolean,
) {
	const now = new Date();
	const me = socket.user;
	let phoneNumber: string | null = null;
	let userName: string | null = deviceName;

	if (me?.id) {
		const decoded = jidDecode(me.id);
		phoneNumber = decoded?.user || null;
		userName = me.name || me.notify || deviceName;
	}

	let accountType: AccountType = AccountType.personal;
	let isBusiness = false;

	if (me?.id) {
		const creds = socket.authState.creds as any;
		const credsAccountType = creds.account?.accountType;

		try {
			const profile = await socket.getBusinessProfile(me.id);
			if (profile && (profile.category || profile.description || profile.address)) {
				isBusiness = true;
				accountType = AccountType.business;
				logger.info('Business account confirmed via profile content', {
					sessionId,
					category: profile.category,
				});
			} else if (credsAccountType !== undefined) {
				isBusiness = credsAccountType === 1; // 1 es Business
				if (isBusiness) accountType = AccountType.business;
				logger.info('Business status confirmed via creds accountType', {
					sessionId,
					isBusiness,
					credsAccountType,
				});
			}
		} catch {
			if (credsAccountType !== undefined) {
				isBusiness = credsAccountType === 1;
				if (isBusiness) accountType = AccountType.business;
				logger.debug('Profile query failed, using creds accountType', {
					sessionId,
					isBusiness,
					credsAccountType,
				});
			} else {
				isBusiness = false;
				accountType = AccountType.personal;
				logger.debug('Business detection inconclusive, defaulting to personal', {
					sessionId,
				});
			}
		}
	}

	try {
		return await withPrismaRetry(async () => {
			await prisma.userSession.upsert({
				where: { sessionId },
				update: {
					status: 'active',
					lastActive: now,
					updatedAt: now,
					deviceName: userName,
					phoneNumber,
					accountType,
					isBusiness,
					data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
				},
				create: {
					id: sessionId,
					sessionId,
					userId,
					status: 'active',
					deviceName: userName,
					phoneNumber,
					accountType,
					isBusiness,
					createdAt: now,
					updatedAt: now,
					lastActive: now,
					data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
				},
			});

			logger.info({ sessionId, phoneNumber, userName }, 'UserSession synced to database');
			return { phoneNumber, deviceName: userName, accountType, isBusiness };
		}, 3, 1000, 'syncUserSessionToDb');
	} catch (e) {
		logger.error({ sessionId, err: e }, 'Failed to sync UserSession to database after retries');
		throw e;
	}
}
