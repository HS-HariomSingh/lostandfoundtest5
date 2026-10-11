import { testAivenConnection, initializeAivenSchema, closeAivenPool } from './connection';

async function main() {
  console.log('--------------------------------------------------');
  console.log(' Lost and Found DBMS - Aiven MySQL Initialization');
  console.log('--------------------------------------------------');

  console.log('\n[1/3] Testing connection to Aiven MySQL...');
  const testResult = await testAivenConnection();

  if (!testResult.success) {
    console.error('\n❌ Connection Failed:');
    console.error(testResult.message);
    console.log('\nPlease make sure your Aiven connection variables are set in .env:');
    console.log('- AIVEN_MYSQL_HOST');
    console.log('- AIVEN_MYSQL_PORT');
    console.log('- AIVEN_MYSQL_USER');
    console.log('- AIVEN_MYSQL_PASSWORD');
    console.log('- AIVEN_MYSQL_DATABASE');
    console.log('Or provide the full Service URI via:');
    console.log('- AIVEN_MYSQL_URL=mysql://avnadmin:***@host:port/lostandfound_db?ssl-mode=REQUIRED\n');
    process.exit(1);
  }

  console.log('✅ ' + testResult.message);
  console.log(`   MySQL Server Version: ${testResult.version || 'unknown'}`);
  console.log(`   Active Database: ${testResult.database || 'default'}`);

  console.log('\n[2/3] Applying database/schema.sql...');
  try {
    const initResult = await initializeAivenSchema();
    console.log('✅ ' + initResult.message);
  } catch (err: any) {
    console.error('❌ Error executing schema.sql:');
    console.error(err.message || err);
    process.exit(1);
  }

  console.log('\n[3/3] Aiven MySQL is ready to use!');
  console.log('Tables created: students, admins, items, item_claims\n');

  await closeAivenPool();
}

main().catch(async (err) => {
  console.error('Unexpected error:', err);
  await closeAivenPool();
  process.exit(1);
});
