import { migrateDatabase } from '@arv/db/migrate';
import { TEST_DATABASE_URL } from './db';

export default async function globalSetup() {
  await migrateDatabase(TEST_DATABASE_URL);
}
