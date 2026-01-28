import { startTracking } from './tracker';

const main = async () => {
  // Prevent the script from exiting
  await startTracking();

  // Keep Node.js process alive
  setInterval(() => {}, 1000 * 60 * 60);
};

main().catch(console.error);
