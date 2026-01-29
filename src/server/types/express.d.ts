import type { Document } from 'mongoose';

export type UserDocument = Document & {
  _id: import('mongoose').Types.ObjectId;
  discordId: string;
  username: string;
  avatar?: string;
  email?: string;
  roles?: string[];
  subscription: {
    plan: string;
    expiresAt?: Date;
    autoRenew: boolean;
    stripeCustomerId?: string;
  };
  isOnboarded: boolean;
  createdAt: Date;
};

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

export {};
