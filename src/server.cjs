const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Update with your actual connection string or config
const pool = new Pool({
  connectionString: 'postgres://bky_ejtc:bky_ejtc@43.216.204.154:5432/bky-ejtc'
});

// After creating the pool
pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL!');
    client.release();
  })
  .catch(err => {
    console.error('Failed to connect to PostgreSQL:', err);
    process.exit(1); // Optional: exit if connection fails
  });

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// Assign Bin to JTC (insert or update)
app.post('/api/assign-bin', async (req, res) => {
  const { jtc, bin_id } = req.body;
  try {
    // Upsert: if bin_id exists, update jtc and last_updated; else insert new row
    await pool.query(
      `INSERT INTO jtc_bin (jtc, bin_id, last_updated)
       VALUES ($1, $2, NOW())
       ON CONFLICT (bin_id) DO UPDATE
         SET jtc = EXCLUDED.jtc, last_updated = NOW()`,
      [jtc, bin_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/scan-bin', async (req, res) => {
  const { bin_id, components } = req.body;
  try {
    await pool.query(
      `INSERT INTO jtc_bin (bin_id, component_1, component_2, component_3, component_4, last_updated)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (bin_id) DO UPDATE
         SET component_1 = EXCLUDED.component_1,
             component_2 = EXCLUDED.component_2,
             component_3 = EXCLUDED.component_3,
             component_4 = EXCLUDED.component_4,
             last_updated = NOW()`,
      [bin_id, components[0], components[1], components[2], components[3]]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(9090, () => console.log('Server running on port 9090'));