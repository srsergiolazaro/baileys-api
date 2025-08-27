import { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { logger } from '@/shared';

const prisma = new PrismaClient();
const saltRounds = 10; // For bcrypt hashing

// Helper to generate a random API key
const generateApiKey = () => {
  return crypto.randomBytes(32).toString('hex'); // 64 character hex string
};

export const create: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.body; // Assuming userId is passed in the body for now

    const plainKey = generateApiKey();
    const hashedKey = await bcrypt.hash(plainKey, saltRounds);

    const apiKey = await prisma.apiKey.create({
      data: {
        key: hashedKey,
        userId: userId,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        enabled: req.body.enabled !== undefined ? req.body.enabled : true,
      },
    });

    // Return the plain key ONLY ON CREATION
    res.status(201).json({ apiKey: apiKey, plainKey: plainKey });
  } catch (e) {
    logger.error(e, 'Error creating API key');
    res.status(500).json({ error: 'An error occurred while creating the API key' });
  }
};

export const findAll: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.query; // Filter by userId if provided

    const apiKeys = await prisma.apiKey.findMany({
      where: userId ? { userId: String(userId) } : {},
      select: {
        id: true,
        userId: true,
        createdAt: true,
        expiresAt: true,
        enabled: true,
      },
    });
    res.status(200).json(apiKeys);
  } catch (e) {
    logger.error(e, 'Error fetching API keys');
    res.status(500).json({ error: 'An error occurred while fetching API keys' });
  }
};

export const findOne: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        expiresAt: true,
        enabled: true,
      },
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API Key not found' });
    }
    res.status(200).json(apiKey);
  } catch (e) {
    logger.error(e, 'Error fetching API key');
    res.status(500).json({ error: 'An error occurred while fetching the API key' });
  }
};

export const update: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresAt, enabled } = req.body;

    const updatedApiKey = await prisma.apiKey.update({
      where: { id },
      data: {
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        enabled: enabled !== undefined ? enabled : undefined,
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        expiresAt: true,
        enabled: true,
      },
    });
    res.status(200).json(updatedApiKey);
  } catch (e) {
    logger.error(e, 'Error updating API key');
    res.status(500).json({ error: 'An error occurred while updating the API key' });
  }
};

export const remove: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.apiKey.delete({
      where: { id },
    });
    res.status(204).send(); // No content
  } catch (e) {
    logger.error(e, 'Error deleting API key');
    res.status(500).json({ error: 'An error occurred while deleting the API key' });
  }
};
