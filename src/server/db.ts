import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/spatial-arb';

export async function connectMongo(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
