const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'unknown';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const app = express();

// Atomic increment: a single UPDATE...RETURNING avoids the classic
// "read, add 1, write back" race condition between app1 and app2
// hitting the same row concurrently.
app.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE visits SET count = count + 1 WHERE id = 1 RETURNING count'
    );
    res.json({ count: result.rows[0].count, served_by: INSTANCE_NAME });
  } catch (err) {
    console.error('Query failed:', err.message);
    res.status(500).json({ error: 'Database error', served_by: INSTANCE_NAME });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', served_by: INSTANCE_NAME });
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY DEFAULT 1,
      count INTEGER NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    INSERT INTO visits (id, count) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;
  `);
}

// The app container may start before Postgres is ready to accept
// connections so we retry the DB init a few times before giving up.
async function initDbWithRetry(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initDb();
      return;
    } catch (err) {
      console.error(`DB init attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

initDbWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[${INSTANCE_NAME}] listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Giving up on DB initialization:', err.message);
    process.exit(1);
  });