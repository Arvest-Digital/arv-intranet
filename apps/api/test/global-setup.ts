import { migrateDatabase } from '@arv/db/migrate';

export default async function setup() {
  await migrateDatabase(
    process.env.TEST_DATABASE_URL ?? 'postgres://arv:arv@localhost:5432/arv_test',
  );
}
