import { Router } from 'express'
import { prisma } from '@/db'
import { logger } from '@/shared'
import { deleteSession } from '@/whatsapp'

const router = Router()

// Crear o actualizar una sesión de usuario
router.post('/', async (req, res) => {
    try {
        logger.info('Recibida petición POST /user-sessions', { body: req.body })
        const { userId, sessionId, phoneNumber, deviceName } = req.body

        if (!userId || !sessionId) {
            logger.warn('Faltan parámetros requeridos', { userId, sessionId })
            return res.status(400).json({
                error: 'userId y sessionId son requeridos'
            })
        }

        // Verificar si ya existe una sesión para este sessionId
        const existingSession = await prisma.userSession.findUnique({
            where: { sessionId }
        })

        let userSession

        if (existingSession) {
            // Actualizar sesión existente
            userSession = await prisma.userSession.update({
                where: { sessionId },
                data: {
                    userId,
                    status: 'active',
                    phoneNumber,
                    deviceName,
                    lastActive: new Date(),
                    updatedAt: new Date()
                }
            })
            logger.info('Sesión de usuario actualizada', { sessionId, userId })
        } else {
            // Crear nueva sesión
            userSession = await prisma.userSession.create({
                data: {
                    userId,
                    sessionId,
                    status: 'active',
                    phoneNumber,
                    deviceName,
                    lastActive: new Date()
                }
            })
            logger.info('Nueva sesión de usuario creada', { sessionId, userId })
        }

        res.json({
            success: true,
            data: userSession
        })
    } catch (error) {
        logger.error('Error al crear/actualizar sesión de usuario:', error)
        res.status(500).json({
            error: 'Error interno del servidor'
        })
    }
})

// Obtener sesiones de un usuario
router.get('/user/:userId', async (req, res) => {
    try {
        logger.info('Recibida petición GET /user-sessions/user/:userId', { userId: req.params.userId })
        const { userId } = req.params
        const { status } = req.query

        const whereClause: any = { userId }
        if (status) {
            whereClause.status = status
        }

        const sessions = await prisma.userSession.findMany({
            where: whereClause,
            orderBy: { lastActive: 'desc' }
        })

        logger.info('Sesiones encontradas', { count: sessions.length, userId })

        res.json({
            success: true,
            data: sessions
        })
    } catch (error) {
        logger.error('Error al obtener sesiones del usuario:', error)
        res.status(500).json({
            error: 'Error interno del servidor'
        })
    }
})

// Obtener información de una sesión específica
router.get('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params

        const session = await prisma.userSession.findUnique({
            where: { sessionId }
        })

        if (!session) {
            return res.status(404).json({
                error: 'Sesión no encontrada'
            })
        }

        res.json({
            success: true,
            data: session
        })
    } catch (error) {
        logger.error('Error al obtener información de la sesión:', error)
        res.status(500).json({
            error: 'Error interno del servidor'
        })
    }
})

// Actualizar estado de una sesión
router.patch('/:sessionId/status', async (req, res) => {
    try {
        const { sessionId } = req.params
        const { status } = req.body

        if (!['active', 'inactive', 'expired'].includes(status)) {
            return res.status(400).json({
                error: 'Estado inválido. Debe ser: active, inactive, o expired'
            })
        }

        const session = await prisma.userSession.update({
            where: { sessionId },
            data: {
                status,
                lastActive: new Date(),
                updatedAt: new Date()
            }
        })

        logger.info('Estado de sesión actualizado', { sessionId, status })

        res.json({
            success: true,
            data: session
        })
    } catch (error) {
        logger.error('Error al actualizar estado de sesión:', error)
        res.status(500).json({
            error: 'Error interno del servidor'
        })
    }
})

// Eliminar una sesión
router.delete('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params

        // Primero eliminar la sesión de WhatsApp y cerrar la conexión
        // Esta función también elimina todos los datos relacionados de la base de datos
        await deleteSession(sessionId)
        logger.info('Sesión de WhatsApp cerrada y datos eliminados', { sessionId })

        // Eliminar la sesión de usuario
        await prisma.userSession.delete({
            where: { sessionId }
        })

        logger.info('Sesión de usuario eliminada completamente', { sessionId })

        res.json({
            success: true,
            message: 'Sesión eliminada correctamente'
        })
    } catch (error) {
        logger.error('Error al eliminar sesión:', error)
        res.status(500).json({
            error: 'Error interno del servidor'
        })
    }
})

// Actualizar última actividad de una sesión
router.patch('/:sessionId/heartbeat', async (req, res) => {
    try {
        const { sessionId } = req.params

        const session = await prisma.userSession.update({
            where: { sessionId },
            data: {
                lastActive: new Date(),
                updatedAt: new Date()
            }
        })

        res.json({
            success: true,
            data: session
        })
    } catch (error) {
        logger.error('Error al actualizar heartbeat de sesión:', error)
        res.status(500).json({
            error: 'Error interno del servidor'
        })
    }
})

export default router 