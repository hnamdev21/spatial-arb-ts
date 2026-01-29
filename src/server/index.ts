import 'dotenv/config';
import { connectMongo } from './db';
import app from './app';

const PORT = Number(process.env.PORT?.trim() || '3000');

async function main(): Promise<void> {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
