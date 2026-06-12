const { getDb } = require('coze-coding-dev-sdk');

async function cleanupTestData() {
  try {
    const db = await getDb();
    const result = await db.execute('DELETE FROM ai_configurations WHERE name LIKE \'Test%\'');
    console.log('Deleted test configurations:', result.rowCount);
  } catch (error) {
    console.error('Error:', error);
  }
}

cleanupTestData();
