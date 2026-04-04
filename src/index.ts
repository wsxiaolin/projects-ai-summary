import { initDatabase } from './db/client';

initDatabase().catch((e) => {
  console.error('Failed to initialize database:', e);
  process.exit(1);
});
