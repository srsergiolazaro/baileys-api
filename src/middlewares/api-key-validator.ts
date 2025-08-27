import { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { logger } from '@/shared';

const prisma = new PrismaClient();

export const apiKeyValidator: RequestHandler = async (req, res, next) => {
  try {
    const apiKeyHeader = req.headers['x-api-key'];

    if (!apiKeyHeader) {
      return res.status(401).json({ error: 'Unauthorized: API Key missing' });
    }

    const plainApiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    // Find all enabled API keys to compare
    const enabledApiKeys = await prisma.apiKey.findMany({
      where: {
        enabled: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    let isValid = false;
    let userId: string | undefined;

    for (const dbApiKey of enabledApiKeys) {
      const match = await bcrypt.compare(plainApiKey, dbApiKey.key);
      if (match) {
        isValid = true;
        userId = dbApiKey.userId;
        break;
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired API Key' });
    }

    // Attach userId to the request for further use
    (req as any).user = { id: userId };
    next();
  } catch (e) {
    logger.error(e, 'Error in API Key validation middleware');
    res.status(500).json({ error: 'Internal server error during API Key validation' });
  }
};