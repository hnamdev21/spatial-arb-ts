import type { Request, Response } from 'express';
import mongoose from 'mongoose';

export function getHealth(_req: Request, res: Response): void {
  const mongoState =
    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    mongo: mongoState,
    timestamp: new Date().toISOString(),
  });
}
