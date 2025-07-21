const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Update with your actual connection string or config
const pool = new Pool({
  connectionString: 'postgres://bky_ejtc:bky_ejtc@43.216.204.154:5432/bky-ejtc'
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  pool.end()
    .then(() => {
      console.log('Database connection closed.');
      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });
    })
    .catch(err => {
      console.error('Error closing database connection:', err);
      server.close(() => {
        console.log('Server closed.');
        process.exit(1);
      });
    });
});

// Test DB connection on startup
pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL!');
    client.release();
  })
  .catch(err => {
    console.error('Failed to connect to PostgreSQL:', err);
    process.exit(1);
  });

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

app.get('/api/bins', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM jtc_bin_new`
    );
    res.json({ success: true, bins: result.rows });
  } catch (err) {
    console.error('Error fetching bins:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/bins/:binId/status', async (req, res) => {
  const { binId } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE jtc_bin_new SET status = $1, last_updated = NOW() WHERE bin_id = $2',
      [status, binId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bin not found' });
    }
    res.json({ success: true, message: `Bin ${binId} status updated to ${status}` });
  } catch (err) {
    console.error('Error updating bin status:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Create a new bin if it doesn't exist
app.post('/api/create-bin', async (req, res) => {
  const { binId } = req.body;

  if (!binId || typeof binId !== 'string' || binId.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'binId is required and must be a non-empty string'
    });
  }

  const normalizedBinId = binId.trim().toUpperCase();

  const client = await pool.connect();

  try {
    // Check if bin already exists
    const existingBin = await client.query(
      'SELECT bin_id FROM jtc_bin_new WHERE bin_id = $1',
      [normalizedBinId]
    );

    if (existingBin.rows.length > 0) {
      // Bin already exists, no need to create
      return res.json({
        success: true,
        message: `Bin ${normalizedBinId} already exists`
      });
    }

    // Insert new bin with default status and timestamps
    await client.query(
      `INSERT INTO jtc_bin_new (bin_id, status, quantity_check_status, created_at, last_updated)
       VALUES ($1, 'Pending JTC', 'unchecked', NOW(), NOW())`,
      [normalizedBinId]
    );

    res.json({
      success: true,
      message: `Bin ${normalizedBinId} created successfully`
    });
  } catch (error) {
    console.error('Error creating bin:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while creating bin'
    });
  } finally {
    client.release();
  }
});

app.post('/api/save-scan-data', async (req, res) => {
  const {
    jtc,
    binId,
    components,
    quantities,
    actualWeights,
    unitWeights
  } = req.body;

  console.log('Received POST request for /api/save-scan-data');
  console.log('Request body:', req.body);

  if (!binId || !components || !Array.isArray(components) || components.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Bin ID and components are required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch current bin status and quantity_check_status
    const binRes = await client.query(
      'SELECT status, quantity_check_status FROM jtc_bin_new WHERE bin_id = $1',
      [binId]
    );
    if (binRes.rows.length === 0) {
      throw new Error('Bin not found');
    }
    const { status: currentStatus, quantity_check_status: currentQtyStatus } = binRes.rows[0];

    // Determine if partial update (pending missing) or full overwrite
    const isPartialUpdate = ['Shortage', 'Excess', 'Pending'].includes(currentQtyStatus);

    // Helper function to process and upsert a component
    async function upsertComponent(componentId, actualQuantity, actualWeight, unitWeightFromFrontend) {
      // Fetch expected quantity, require_scale, unit_weight_g from master
      const expectedRes = await client.query(
        'SELECT expected_quantity_per_bin, require_scale, unit_weight_g FROM components_master WHERE component_id = $1',
        [componentId]
      );
      if (expectedRes.rows.length === 0) {
        throw new Error(`Component ${componentId} not found in master list`);
      }
      const { expected_quantity_per_bin: expectedQuantity, require_scale, unit_weight_g: masterUnitWeightG } = expectedRes.rows[0];

      // Fetch existing actual_weight, actual_quantity, unit_weight_g from jtc_bin_components (if any)
      const existingRes = await client.query(
        'SELECT actual_weight, actual_quantity, unit_weight_g FROM jtc_bin_components WHERE bin_id = $1 AND component_id = $2',
        [binId, componentId]
      );
      const existing = existingRes.rows[0] || {};

      // Use existing values if frontend values are null/undefined in partial update
      if (isPartialUpdate) {
        if (actualQuantity == null) actualQuantity = existing.actual_quantity;
        if (actualWeight == null || actualWeight === 0) actualWeight = existing.actual_weight;
      }

      let unitWeightG = null;

      if (!require_scale) {
        // For components that do NOT require scale, use master unit weight
        unitWeightG = masterUnitWeightG;

        if (actualQuantity == null) {
          actualQuantity = expectedQuantity;
        }

        actualWeight = actualQuantity && unitWeightG
          ? parseFloat(((actualQuantity * unitWeightG) / 1000).toFixed(3))
          : null;

      } else {
        // For components that require scale, use unit weight from frontend if provided
        unitWeightG = (typeof unitWeightFromFrontend === 'number' && unitWeightFromFrontend > 0)
          ? unitWeightFromFrontend
          : existing.unit_weight_g || null;

        // Do NOT calculate unitWeightG from actualWeight and actualQuantity anymore
      }

      // Calculate discrepancy
      const difference = (actualQuantity || 0) - (expectedQuantity || 0);
      let discrepancyType = 'OK';
      if (difference < 0) discrepancyType = 'Shortage';
      else if (difference > 0) discrepancyType = 'Excess';

      // Upsert component data
      if (isPartialUpdate) {
        await client.query(`
          INSERT INTO jtc_bin_components (
            bin_id, component_id, actual_weight, actual_quantity, expected_quantity, discrepancy_type, difference, unit_weight_g, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (bin_id, component_id) DO UPDATE SET
            actual_weight = EXCLUDED.actual_weight,
            actual_quantity = EXCLUDED.actual_quantity,
            expected_quantity = EXCLUDED.expected_quantity,
            discrepancy_type = EXCLUDED.discrepancy_type,
            difference = EXCLUDED.difference,
            unit_weight_g = EXCLUDED.unit_weight_g,
            recorded_at = NOW()
        `, [binId, componentId, actualWeight, actualQuantity, expectedQuantity, discrepancyType, difference, unitWeightG]);
      } else {
        await client.query(`
          INSERT INTO jtc_bin_components (
            bin_id, component_id, actual_weight, actual_quantity, expected_quantity, discrepancy_type, difference, unit_weight_g, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [binId, componentId, actualWeight, actualQuantity, expectedQuantity, discrepancyType, difference, unitWeightG]);
      }

      // Update unit_weight_g in components_master if changed
      if (unitWeightG != null) {
        await client.query(
          `UPDATE components_master
     SET unit_weight_g = $1,
         updated_at = NOW()
     WHERE component_id = $2
       AND (unit_weight_g IS NULL OR unit_weight_g <> $1)`,
          [unitWeightG, componentId]
        );
      }
    }

    // Upsert bin info with new JTC and status (initially)
    const initialStatus = jtc ? 'Ready for Release' : (currentStatus === 'Pending JTC' ? 'Pending JTC' : currentStatus);

    const upsertBinQuery = `
      INSERT INTO jtc_bin_new (
        bin_id, jtc, status, last_updated, created_at
      ) VALUES ($1::varchar, $2, $3, NOW(), COALESCE(
        (SELECT created_at FROM jtc_bin_new WHERE bin_id = $1::varchar), NOW()
      ))
      ON CONFLICT (bin_id) DO UPDATE SET
        jtc = EXCLUDED.jtc,
        status = EXCLUDED.status,
        last_updated = NOW()
    `;
    await client.query(upsertBinQuery, [binId, jtc, initialStatus]);

    if (!isPartialUpdate) {
      // Full overwrite: delete existing components first
      await client.query('DELETE FROM jtc_bin_components WHERE bin_id = $1', [binId]);
    }

    // Process each component
    for (let i = 0; i < components.length; i++) {
      const componentId = components[i];
      let actualQuantity = quantities[i] != null ? quantities[i] : null;
      let actualWeight = actualWeights[i] != null ? actualWeights[i] : null;
      let unitWeightFromFrontend = unitWeights && unitWeights[i] != null ? unitWeights[i] : null;

      await upsertComponent(componentId, actualQuantity, actualWeight, unitWeightFromFrontend);
    }

    // Recalculate quantity check status after component updates
    const compRows = await client.query(
      'SELECT discrepancy_type FROM jtc_bin_components WHERE bin_id = $1',
      [binId]
    );

    let hasShortage = false;
    let hasExcess = false;

    for (const row of compRows.rows) {
      if (row.discrepancy_type === 'Shortage') hasShortage = true;
      else if (row.discrepancy_type === 'Excess') hasExcess = true;
    }

    let newQuantityCheckStatus = 'Ready';
    if (hasShortage) newQuantityCheckStatus = 'Shortage';
    else if (hasExcess) newQuantityCheckStatus = 'Excess';

    // Determine final bin status based on quantity check and JTC presence
    let finalStatus;
    if (newQuantityCheckStatus === 'Ready') {
      finalStatus = jtc ? 'Ready for Release' : 'Pending JTC';
    } else {
      finalStatus = 'Pending Refill'; // or 'Pending Correction'
    }

    // Update bin status and quantity_check_status
    await client.query(
      `UPDATE jtc_bin_new SET status = $1, quantity_check_status = $2, last_updated = NOW() WHERE bin_id = $3`,
      [finalStatus, newQuantityCheckStatus, binId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Bin ${binId} data saved successfully with status '${finalStatus}' and quantity check status '${newQuantityCheckStatus}'`,
      binId,
      status: finalStatus,
      quantity_check_status: newQuantityCheckStatus
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving scan data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Database error while saving scan data'
    });
  } finally {
    client.release();
  }
});
// Assign multiple bins to a JTC
app.post('/api/assign-bins', async (req, res) => {
  const { jtc, bins } = req.body;

  if (!jtc || !bins || !Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'JTC and bins array are required'
    });
  }

  try {
    // Verify all bins exist
    const placeholders = bins.map((_, i) => `$${i + 1}`).join(',');
    const checkQuery = `SELECT bin_id, status FROM jtc_bin_new WHERE bin_id IN (${placeholders})`;
    const checkResult = await pool.query(checkQuery, bins);

    if (checkResult.rows.length !== bins.length) {
      const foundBins = checkResult.rows.map(r => r.bin_id);
      const missingBins = bins.filter(bin => !foundBins.includes(bin));
      return res.status(404).json({
        success: false,
        error: `Bins not found: ${missingBins.join(', ')}`
      });
    }

    // Update bins with JTC and status
    const updatePlaceholders = bins.map((_, i) => `$${i + 2}`).join(',');
    const updateQuery = `
      UPDATE jtc_bin_new
      SET jtc = $1, status = 'Ready for Release', last_updated = NOW()
      WHERE bin_id IN (${updatePlaceholders})
    `;
    const updateParams = [jtc, ...bins];
    const result = await pool.query(updateQuery, updateParams);

    if (result.rowCount === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to assign bins to JTC'
      });
    }

    res.json({
      success: true,
      message: `Successfully assigned ${bins.length} bin(s) to JTC ${jtc}`,
      jtc,
      assignedBins: bins
    });

  } catch (error) {
    console.error('Error assigning bins:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while assigning bins'
    });
  }
});

// Release bins and update location to workcell
app.post('/api/release-bins', async (req, res) => {
  const { bins } = req.body;

  if (!bins || !Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Bins array is required and must not be empty'
    });
  }

  try {
    const placeholders = bins.map((_, i) => `$${i + 1}`).join(',');
    const checkQuery = `SELECT bin_id, status, wc_id FROM jtc_bin_new WHERE bin_id IN (${placeholders})`;
    const checkResult = await pool.query(checkQuery, bins);

    if (checkResult.rows.length !== bins.length) {
      const foundBins = checkResult.rows.map(r => r.bin_id);
      const missingBins = bins.filter(bin => !foundBins.includes(bin));
      return res.status(404).json({
        success: false,
        error: `Bins not found: ${missingBins.join(', ')}`
      });
    }

    const invalidBins = checkResult.rows.filter(r => r.status !== 'Ready for Release');
    if (invalidBins.length > 0) {
      const invalidBinIds = invalidBins.map(r => `${r.bin_id} (${r.status})`);
      return res.status(400).json({
        success: false,
        error: `These bins are not ready for release: ${invalidBinIds.join(', ')}. Please assign them to a JTC first.`
      });
    }

    // Update bins status and location
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of checkResult.rows) {
        const location = row.wc_id || 'UNKNOWN_WC';
        await client.query(
          `UPDATE jtc_bin_new SET 
          status = 'Released',
           last_used = NOW(), last_updated = NOW(), location = $1 WHERE bin_id = $2`,
          [location, row.bin_id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: `Successfully released ${bins.length} bin(s) and updated their location to workcell`,
      releasedBins: bins
    });

  } catch (error) {
    console.error('Error releasing bins:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while releasing bins'
    });
  }
});

// Update status for multiple bins
app.post('/api/update-bin-status', async (req, res) => {
  const { bins, status } = req.body;

  if (!bins || !Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Bins array is required and must not be empty'
    });
  }

  if (!status) {
    return res.status(400).json({
      success: false,
      error: 'Status is required'
    });
  }

  const validStatuses = ['Pending JTC', 'Ready for Release', 'Released', 'Pending Refill'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  try {
    const placeholders = bins.map((_, i) => `$${i + 2}`).join(',');
    const query = `
      UPDATE jtc_bin_new
      SET status = $1, last_updated = NOW()
      WHERE bin_id IN (${placeholders})
    `;
    const params = [status, ...bins];
    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'No bins were updated. Please check if the bin IDs exist.'
      });
    }

    res.json({
      success: true,
      message: `Successfully updated ${result.rowCount} bin(s) to status: ${status}`,
      updatedBins: bins,
      newStatus: status
    });

  } catch (error) {
    console.error('Error updating bin status:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while updating bin status'
    });
  }
});

app.get('/api/bin-info/:binId', async (req, res) => {
  const { binId } = req.params;
  console.log('Received binId:', binId);

  try {
    const binResult = await pool.query('SELECT * FROM jtc_bin_new WHERE bin_id = $1', [binId]);
    if (binResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bin not found' });
    }
    const bin = binResult.rows[0];

    const componentsResult = await pool.query(
      `SELECT 
         c.component_id, 
         c.actual_weight, 
         c.actual_quantity, 
         cm.expected_quantity_per_bin, 
         cm.component_name, 
         cm.require_scale,
         CASE 
           WHEN c.actual_weight IS NOT NULL AND c.actual_quantity IS NOT NULL AND c.actual_quantity > 0 
           THEN ROUND((c.actual_weight * 1000) / c.actual_quantity, 2)
           ELSE cm.unit_weight_g
         END AS unit_weight_g,
         c.discrepancy_type, 
         c.difference, 
         c.recorded_at
       FROM jtc_bin_components c
       JOIN components_master cm ON c.component_id = cm.component_id
       WHERE c.bin_id = $1
       ORDER BY c.id`,
      [binId]
    );

    res.json({
      success: true,
      bin,
      components: componentsResult.rows
    });
  } catch (error) {
    console.error('Failed to fetch bin information:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bin information' });
  }
});

// Get JTC info by barcode
app.get('/api/jtc-info/:barcodeId', async (req, res) => {
  const { barcodeId } = req.params;
  const query = `SELECT * FROM jtc WHERE "jtc_barcodeId" = $1 LIMIT 1`;

  try {
    const result = await pool.query(query, [barcodeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'JTC not found' });
    }
    res.json({ success: true, jtc: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Print work order label


app.get('/api/component-master/:componentId', async (req, res) => {
  const { componentId } = req.params;
  const { binId } = req.query; // optional binId

  try {
    // Fetch master data
    const masterResult = await pool.query(
      `SELECT 
         expected_quantity_per_bin, 
         component_name,
         unit_weight_g,
         require_scale
       FROM components_master 
       WHERE component_id = $1`,
      [componentId]
    );

    if (masterResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Component not found in master list' });
    }

    const masterData = masterResult.rows[0];

    // Initialize response data with master data
    const responseData = {
      success: true,
      component_id: componentId,
      component_name: masterData.component_name,
      expected_quantity_per_bin: masterData.expected_quantity_per_bin,
      unit_weight_g: masterData.unit_weight_g,
      require_scale: masterData.require_scale,
    };

    // If binId provided, fetch last saved scale info for this bin-component
    if (binId) {
      const binCompResult = await pool.query(
        `SELECT actual_quantity, actual_weight, unit_weight_g
         FROM jtc_bin_components
         WHERE bin_id = $1 AND component_id = $2
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [binId, componentId]
      );

      if (binCompResult.rows.length > 0) {
        const binCompData = binCompResult.rows[0];
        responseData.last_actual_quantity = binCompData.actual_quantity;
        responseData.last_actual_weight = binCompData.actual_weight;
        responseData.last_unit_weight_g = binCompData.unit_weight_g;
      }
    }

    res.json(responseData);

  } catch (err) {
    console.error('Error fetching component master:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});


// Get JTC info by jtc_id (integer)
app.get('/api/jtc-info-by-id/:jtcId', async (req, res) => {
  const { jtcId } = req.params;
  const query = `SELECT * FROM jtc WHERE jtc_id = $1 LIMIT 1`;
  console.log('getting jtc info:', jtcId);

  try {
    const result = await pool.query(query, [jtcId]);
    console.log('Query:', query);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'JTC not found' });
    }
    res.json({ success: true, jtc: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
app.get('/api/jtc-assigned-bins-count/:jtcId', async (req, res) => {
  const { jtcId } = req.params;

  try {
    const result = await pool.query(
      'SELECT COUNT(*) AS count FROM jtc_bin_new WHERE jtc = $1',
      [jtcId]
    );

    const count = parseInt(result.rows[0].count, 10);

    res.json({ success: true, jtcId, assignedBinsCount: count });
  } catch (error) {
    console.error('Error fetching assigned bins count:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get BOM list by jtc_RevId (string or bigint)
app.get('/api/jtc-bom/:jtcRevId', async (req, res) => {
  const { jtcRevId } = req.params;
  console.log('getting jtc bom rev id:', jtcRevId);

  try {
    const query = `
      SELECT jtc_material AS component_id, "jtc_QuantityPerItem" AS quantity_per_item
      FROM jtc_bom_insyi
      WHERE jtc_flowrevid = $1
      ORDER BY id
    `;
    const result = await pool.query(query, [jtcRevId]);
    console.log('Query:', query);
    console.log('result:', result.rows);

    res.json({ success: true, bom: result.rows });
  } catch (err) {
    console.error('Error fetching BOM list:', err);
    res.status(500).json({ success: false, error: 'Server error fetching BOM list' });
  }
});

// Get all bins for a given JTC ID
app.get('/api/bins-by-jtc/:jtcId', async (req, res) => {
  const { jtcId } = req.params;

  try {
    const result = await pool.query(
      'SELECT bin_id FROM jtc_bin_new WHERE jtc = $1',
      [jtcId]
    );

    const bins = result.rows.map(row => row.bin_id);

    res.json({ success: true, bins });
  } catch (error) {
    console.error('Error fetching bins by JTC:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Return bins to warehouse: update location, clear JTC, reset quantities
app.post('/api/return-bins-to-warehouse', async (req, res) => {
  const { bins } = req.body;

  if (!Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({ success: false, error: 'Bins array is required and must not be empty' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const binId of bins) {
      // 1. Update bin location to warehouse (adjust location string as needed)
      // 2. Clear JTC binding (set jtc to null)
      // 3. Reset component quantities and weights to zero in jtc_bin_components
      // 4. Update bin status to 'Returned to Warehouse' or similar

      await client.query(
        `UPDATE jtc_bin_new
         SET location = $1,
             jtc = NULL,
             status = $2,
             last_updated = NOW(),
             quantity_check_status = 'unchecked'
         WHERE bin_id = $3`,
        ['WAREHOUSE', 'Returned to Warehouse', binId]
      );

      await client.query(
        `UPDATE jtc_bin_components
         SET actual_quantity = 0,
             actual_weight = 0,
             discrepancy_type = NULL,
             difference = NULL,
             recorded_at = NOW()
         WHERE bin_id = $1`,
        [binId]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, message: `Successfully returned ${bins.length} bin(s) to warehouse.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error returning bins to warehouse:', error);
    res.status(500).json({ success: false, error: 'Failed to return bins to warehouse' });
  } finally {
    client.release();
  }
});

app.post('/api/print-work-order-label', async (req, res) => {
  const labelData = req.body;
  const tspl = generateWorkOrderTSPL(labelData);

  try {
    const response = await axios.post(
      'http://localhost:9999/print-label',
      { tspl },
      { timeout: 5000 }
    );
    if (response.data && response.data.success) {
      return res.json({ success: true, message: 'Label sent to printer.' });
    } else {
      return res.status(500).json({ success: false, error: 'Print agent error.' });
    }
  } catch (err) {
    console.error('Error sending label to print agent:', err);
    return res.status(500).json({ success: false, error: 'Print agent unreachable or error.' });
  }
});

function generateWorkOrderTSPL({
  coNumber = '',
  woNumber = '',
  partName = '',
  dateIssue = '',
  stockCode = '',
  processCode = '',
  empNo = '',
  qty = '',
  remarks = '',
  jtc_barcodeId = ''
}) {
  const formattedDate = dateIssue
    ? new Date(dateIssue).toLocaleDateString("en-GB")
    : '';

  const barcodeContent = `*j${jtc_barcodeId}`;

  return `
SIZE 80 mm, 70 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS

; OUTER BORDER
BOX 10,10,630,550,3

; HEADER (centered)
TEXT 200,20,"3",0,1,1,"WORK ORDER LABEL"

; GRID LINES -------------------------------------------------
BAR 10,80,630,3
BAR 10,170,630,3
BAR 200,80,3,90
BAR 10,260,630,3
BAR 196,170,3,90
BAR 392,170,3,90
BAR 10,350,630,3
BAR 200,260,3,90
BAR 10,600,630,3

; -------- LABELS & VALUES --------
TEXT 20,90,"1",0,1,1,"W.O. NO.:"
TEXT 20,120,"2",0,1,1,"${coNumber}"
TEXT 210,90,"1",0,1,1,"PART NAME:"
TEXT 210,120,"2",0,1,1,"${partName}"

TEXT 20,180,"1",0,1,1,"DATE ISSUE:"
TEXT 20,210,"2",0,1,1,"${formattedDate}"
TEXT 200,180,"1",0,1,1,"STOCK CODE:"
TEXT 200,210,"2",0,1,1,"${stockCode}"
TEXT 400,180,"1",0,1,1,"PROCESS CODE/NO.:"
TEXT 400,210,"2",0,1,1,"${processCode}"

TEXT 20,270,"1",0,1,1,"EMP. NO.:"
TEXT 20,300,"2",0,1,1,"${empNo}"
TEXT 210,270,"1",0,1,1,"QTY.:"
TEXT 210,300,"2",0,1,1,"${qty}"

TEXT 20,360,"1",0,1,1,"REMARKS:"
TEXT 20,400,"2",0,1,1,"${remarks}"

; Barcode with *j + barcode ID
BARCODE 330,430,"128",80,1,0,2,2,"${barcodeContent}"

PRINT 1,1
  `;
}


app.post('/api/print-work-order-label-hprt', async (req, res) => {
  const labelData = req.body;
  try {
    const response = await axios.post('http://10.0.120.187:9999/print-label', {
      printerType: 'hprt',
      labelData: labelData
    });

    if (response.data && response.data.success) {
      return res.json({ success: true, message: 'Label sent to printer.' });
    } else {
      return res.status(500).json({ success: false, error: 'Print agent error.' });
    }
  } catch (err) {
    console.error('Error sending label to print agent:', err);
    return res.status(500).json({ success: false, error: 'Print agent unreachable or error.' });
  }
});

function generateEscposLabel({
  coNumber = '',
  woNumber = '',
  partName = '',
  dateIssue = '',
  stockCode = '',
  processCode = '',
  empNo = '',
  qty = '',
  remarks = '',
  jtc_barcodeId = ''
}) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const formattedDate = dateIssue ? new Date(dateIssue).toLocaleDateString("en-GB") : '';
  const barcode = `*j${jtc_barcodeId}`;

  return (
    ESC + '@' +
    ESC + '!' + '\x38' + // double height & width
    ESC + 'a' + '\x01' + // center align
    'WORK ORDER LABEL\n\n' +
    ESC + 'a' + '\x00' + // left align
    `W.O. NO.: ${coNumber}\n` +
    `PART NAME: ${partName}\n\n` +
    `DATE ISSUE: ${formattedDate}\n` +
    `STOCK CODE: ${stockCode}\n` +
    `PROCESS CODE/NO.: ${processCode}\n\n` +
    `EMP. NO.: ${empNo}\n` +
    `QTY.: ${qty}\n\n` +
    `REMARKS: ${remarks}\n\n` +
    GS + 'h' + '\x50' +
    GS + 'w' + '\x02' +
    GS + 'H' + '\x02' +
    GS + 'k' + '\x49' + String.fromCharCode(barcode.length) + barcode +
    '\n\n\n' +
    GS + 'V' + '\x01' // full cut
  );
}
const server = app.listen(9090, () => console.log('Server running on port 9090'));