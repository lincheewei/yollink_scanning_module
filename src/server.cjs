const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios'); // Add this at the top of your file

const app = express();
app.use(cors());
app.use(express.json());




// Update with your actual connection string or config
const pool = new Pool({
  connectionString: 'postgres://bky_ejtc:bky_ejtc@43.216.204.154:5432/bky-ejtc'
});

// Handle the SIGINT signal (Ctrl+C)
process.on('SIGINT', () => {
  console.log('Shutting down server...');

  // Close the database connection pool (if applicable)
  pool.end()
    .then(() => {
      console.log('Database connection closed.');
      // Close the server
      server.close(() => {
        console.log('Server closed.');
        process.exit(0); // Exit the processx
      });
    })
    .catch(err => {
      console.error('Error closing database connection:', err);
      server.close(() => {
        console.log('Server closed.');
        process.exit(1); // Exit with an error code
      });
    });
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

// POST /api/save-scan-data - Save scanned bin data and set status/location
app.post('/api/save-scan-data', async (req, res) => {
  const {
    jtc,
    binId,
    components,
    quantities,
    expectedWeights,
    actualWeights
  } = req.body;

  if (!binId || !components) {
    return res.status(400).json({
      success: false,
      error: 'Bin ID and components are required'
    });
  }

  try {
    // Determine status based on whether JTC is provided
    const status = jtc ? 'Ready for Release' : 'Pending JTC';

    // Prepare component data (up to 4 components)
    const component1 = components[0] || null;
    const component2 = components[1] || null;
    const component3 = components[2] || null;
    const component4 = components[3] || null;

    const quantity1 = quantities ? quantities[0] : null;
    const quantity2 = quantities ? quantities[1] : null;
    const quantity3 = quantities ? quantities[2] : null;
    const quantity4 = quantities ? quantities[3] : null;

    const expectedWeight1 = expectedWeights ? expectedWeights[0] : null;
    const expectedWeight2 = expectedWeights ? expectedWeights[1] : null;
    const expectedWeight3 = expectedWeights ? expectedWeights[2] : null;
    const expectedWeight4 = expectedWeights ? expectedWeights[3] : null;

    const actualWeight1 = actualWeights ? actualWeights[0] : null;
    const actualWeight2 = actualWeights ? actualWeights[1] : null;
    const actualWeight3 = actualWeights ? actualWeights[2] : null;
    const actualWeight4 = actualWeights ? actualWeights[3] : null;

    // Insert or update bin data
    const query = `
      INSERT INTO jtc_bin (
        bin_id, jtc, 
        component_1, component_2, component_3, component_4,
        quantity_c1, quantity_c2, quantity_c3, quantity_c4,
        expected_weight_c1, expected_weight_c2, expected_weight_c3, expected_weight_c4,
        actual_weight_c1, actual_weight_c2, actual_weight_c3, actual_weight_c4,
        status, location, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
      ON CONFLICT (bin_id) DO UPDATE SET
        jtc = EXCLUDED.jtc,
        component_1 = EXCLUDED.component_1,
        component_2 = EXCLUDED.component_2,
        component_3 = EXCLUDED.component_3,
        component_4 = EXCLUDED.component_4,
        quantity_c1 = EXCLUDED.quantity_c1,
        quantity_c2 = EXCLUDED.quantity_c2,
        quantity_c3 = EXCLUDED.quantity_c3,
        quantity_c4 = EXCLUDED.quantity_c4,
        expected_weight_c1 = EXCLUDED.expected_weight_c1,
        expected_weight_c2 = EXCLUDED.expected_weight_c2,
        expected_weight_c3 = EXCLUDED.expected_weight_c3,
        expected_weight_c4 = EXCLUDED.expected_weight_c4,
        actual_weight_c1 = EXCLUDED.actual_weight_c1,
        actual_weight_c2 = EXCLUDED.actual_weight_c2,
        actual_weight_c3 = EXCLUDED.actual_weight_c3,
        actual_weight_c4 = EXCLUDED.actual_weight_c4,
        status = EXCLUDED.status,
        location = EXCpLUDED.location,
        last_updated = NOW()
    `;

    const params = [
      binId, jtc,
      component1, component2, component3, component4,
      quantity1, quantity2, quantity3, quantity4,
      expectedWeight1, expectedWeight2, expectedWeight3, expectedWeight4,
      actualWeight1, actualWeight2, actualWeight3, actualWeight4,
      status, 'WH1'
    ];

    await pool.query(query, params);

    res.json({
      success: true,
      message: `Bin ${binId} data saved successfully with status '${status}' and location 'WH1'`,
      binId: binId,
      status: status,
      location: 'WH1'
    });

  } catch (error) {
    console.error('Error saving scan data:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while saving scan data'
    });
  }
});

// POST /api/assign-bins - Assign bins to JTC (multiple bins)
app.post('/api/assign-bins', async (req, res) => {
  const { jtc, bins } = req.body;
  console.log(jtc);
  console.log(bins);


  if (!jtc || !bins || !Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'JTC and bins array are required'
    });
  }

  try {
    // First, verify all bins have status "pending JTC"
    const placeholders = bins.map((_, index) => `$${index + 1}`).join(',');
    const checkQuery = `
      SELECT bin_id, status 
      FROM jtc_bin 
      WHERE bin_id IN (${placeholders})
    `;

    const checkResult = await pool.query(checkQuery, bins);

    // Check if all bins exist
    if (checkResult.rows.length !== bins.length) {
      const foundBins = checkResult.rows.map(row => row.bin_id);
      const missingBins = bins.filter(bin => !foundBins.includes(bin));
      return res.status(404).json({
        success: false,
        error: `Bins not found: ${missingBins.join(', ')}`
      });
    }

    // Check if all bins have status "pending JTC"



    // Update bins with JTC assignment and change status to "ready for release"
    const updatePlaceholders = bins.map((_, index) => `$${index + 2}`).join(',');
    const updateQuery = `
      UPDATE jtc_bin 
      SET jtc = $1, status = 'Ready for Release', last_updated = NOW() 
      WHERE bin_id IN (${updatePlaceholders})
    `;

    const updateParams = [jtc, ...bins];
    const result = await pool.query(updateQuery, updateParams);
    console.log(result);

    if (result.rowCount === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to assign bins to JTC'
      });
    }

    res.json({
      
      success: true,
      message: `Successfully assigned ${bins.length} bin(s) to JTC ${jtc}`,
      jtc: jtc,
      assignedBins: bins
    });
    console.log(res.json)

  } catch (error) {
    console.error('Error assigning bins:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while assigning bins'
    });
  }
});

// POST /api/assign-bin - Single bin assignment (keeping for backward compatibility)
app.post('/api/assign-bin', async (req, res) => {
  const { jtc, bin_id } = req.body;
  try {
    // Check if bin exists and has status "pending JTC"
    const checkResult = await pool.query(
      'SELECT status FROM jtc_bin WHERE bin_id = $1',
      [bin_id]
    );

    if (checkResult.rows.length === 0) {
      return res.json({ success: false, error: 'Bin not found' });
    }

    if (checkResult.rows[0].status !== 'Pending JTC') {
      return res.json({
        success: false,
        error: `Bin ${bin_id} is not ready for assignment. Current status: ${checkResult.rows[0].status}`
      });
    }

    // Update with JTC and change status
    await pool.query(
      `UPDATE jtc_bin 
       SET jtc = $1, status = 'Ready for Release', last_updated = NOW()
       WHERE bin_id = $2`,
      [jtc, bin_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/release-bins - Release bins and update location to workcell
app.post('/api/release-bins', async (req, res) => {
  const { bins } = req.body;

  if (!bins || !Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Bins array is required and must not be empty'
    });
  }

  try {
    // First, verify all bins have status "ready for release"
    const placeholders = bins.map((_, index) => `$${index + 1}`).join(',');
    const checkQuery = `
      SELECT bin_id, status, wc_id 
      FROM jtc_bin 
      WHERE bin_id IN (${placeholders})
    `;

    const checkResult = await pool.query(checkQuery, bins);

    if (checkResult.rows.length !== bins.length) {
      const foundBins = checkResult.rows.map(row => row.bin_id);
      const missingBins = bins.filter(bin => !foundBins.includes(bin));
      return res.status(404).json({
        success: false,
        error: `Bins not found: ${missingBins.join(', ')}`
      });
    }

    const invalidBins = checkResult.rows.filter(row => row.status !== 'Ready for release');
    if (invalidBins.length > 0) {
      const invalidBinIds = invalidBins.map(row => `${row.bin_id} (${row.status})`);
      return res.status(400).json({
        success: false,
        error: `These bins are not ready for release: ${invalidBinIds.join(', ')}. Please assign them to a JTC first.`
      });
    }

    // For each bin, update status to 'released' and set location to wc_id
    for (const row of checkResult.rows) {
      const updateQuery = `
        UPDATE jtc_bin 
        SET status = 'released', last_used = NOW(), last_updated = NOW(), location = $1 
        WHERE bin_id = $2
      `;
      await pool.query(updateQuery, [row.wc_id || 'UNKNOWN_WC', row.bin_id]);
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

// POST /api/update-bin-status - Update status for multiple bins
app.post('/api/update-bin-status', async (req, res) => {
  const { bins, status } = req.body;

  // Validate input
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

  // Validate status values
  const validStatuses = ['pending JTC', 'ready for release', 'released'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  try {
    // Create placeholders for the IN clause
    const placeholders = bins.map((_, index) => `$${index + 2}`).join(',');
    const query = `
      UPDATE  jtc_bin
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

// Legacy endpoint - keeping for backward compatibility
app.post('/api/scan-bin', async (req, res) => {
  const { bin_id, components, actualWeights } = req.body;
  try {
    await pool.query(
      `INSERT INTO jtc_bin (
          bin_id, component_1, component_2, component_3, component_4,
          actual_weight_c1, actual_weight_c2, actual_weight_c3, actual_weight_c4, 
          status, location, last_updated
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending JTC', 'WH1', NOW())
       ON CONFLICT (bin_id) DO UPDATE
         SET component_1 = EXCLUDED.component_1,
             component_2 = EXCLUDED.component_2,
             component_3 = EXCLUDED.component_3,
             component_4 = EXCLUDED.component_4,
             actual_weight_c1 = EXCLUDED.actual_weight_c1,
             actual_weight_c2 = EXCLUDED.actual_weight_c2,
             actual_weight_c3 = EXCLUDED.actual_weight_c3,
             actual_weight_c4 = EXCLUDED.actual_weight_c4,
             status = 'pending JTC',
             location = 'WH1',
             last_updated = NOW()`,
      [
        bin_id,
        components[0], components[1], components[2], components[3],
        actualWeights[0], actualWeights[1], actualWeights[2], actualWeights[3]
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get per unit weight for a component
app.get('/api/get-per-unit-weight', async (req, res) => {
  const { component } = req.query;
  console.log('Received get-per-unit-weight for:', component);
  if (!component) {
    return res.json({ success: false, error: 'Component ID is required' });
  }

  try {
    const result = await pool.query(
      `SELECT weight, quantity_per_bulk 
       FROM component_weight_records 
       WHERE component_id = $1 
       ORDER BY recorded_at DESC 
       LIMIT 1`,
      [component]
    );

    if (result.rows.length > 0) {
      const { weight, quantity_per_bulk } = result.rows[0];
      // Calculate per unit weight (total weight / quantity per bulk)
      const perUnitWeight = parseFloat(weight) / parseInt(quantity_per_bulk);

      res.json({
        success: true,
        perUnitWeight: perUnitWeight,
        totalWeight: parseFloat(weight),
        quantityPerBulk: parseInt(quantity_per_bulk)
      });
    } else {
      res.json({
        success: false,
        error: 'No weight record found for this component'
      });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Record component weight and quantity per bulk
app.post('/api/record-component-weight', async (req, res) => {
  const { componentId, weight, quantity } = req.body;
  try {
    // Don't specify 'id' - let PostgreSQL auto-generate it
    const result = await pool.query(
      `INSERT INTO component_weight_records (component_id, weight, quantity_per_bulk, recorded_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id`,
      [componentId, weight, quantity]
    );

    res.json({
      success: true,
      id: result.rows[0].id,
      message: "Component weight recorded successfully"
    });
  } catch (err) {
    console.error('Database error:', err);
    res.json({ success: false, error: err.message });
  }
});

// GET /api/bin-info/:binId
app.get('/api/bin-info/:binId', async (req, res) => {
  try {
    const { binId } = req.params;
    const query = `
      SELECT *
      FROM jtc_bin 
      WHERE bin_id = $1
    `;
    const result = await pool.query(query, [binId]);
    console.log('Query result:', result.rows);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bin not found' });
    }
    res.json({ success: true, bin: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch bin information' });
  }
});

// GET /api/jtc-info/:barcodeId
app.get('/api/jtc-info/:barcodeId', async (req, res) => {
  const { barcodeId } = req.params;
  const query = `SELECT * FROM jtc WHERE "jtc_barcodeId" = $1 LIMIT 1`;
  console.log(barcodeId);
  try {
    const result = await pool.query(query, [barcodeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'JTC not found' });
    }
    res.json({ success: true, jtc: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ uccess: false, error: 'Server error' });
  }
});



const path = require('path');
const { exec } = require('child_process');

app.post('/api/print-work-order-label', async (req, res) => {
  const labelData = req.body;
  const tspl = generateWorkOrderTSPL(labelData);

  // Send TSPL to local print agent on the Windows PC (replace with your agent's IP!)
  try {
    const response = await axios.post(
      'http://10.0.110.115:9999/print-label', // e.g. http://192.168.1.55:9999/print-label
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
  woNumber = '',
  partName = '',
  dateIssue = '',
  stockCode = '',
  processCode = '',
  empNo = '',
  qty = '',
  remarks = ''
}) {
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
; Header row bottom
BAR 10,80,630,3

; --- ROW 1 (W.O. NO. / PART NAME) ---
BAR 10,170,630,3
; 30/70 vertical (W.O. NO. | PART NAME)
BAR 200,80,3,90

; --- ROW 2 (DATE / STOCK / PROCESS) ---
BAR 10,260,630,3
; 30% = 186, next 30% = 186, last = 248
BAR 196,170,3,90      ; after DATE ISSUE (30%)
BAR 392,170,3,90      ; after STOCK CODE (30%)
; (PROCESS CODE = remainder, 40%)

; --- ROW 3 (EMP NO. / QTY) ---
BAR 10,350,630,3
; 30/70 vertical (EMP NO. | QTY)
BAR 200,260,3,90

; --- REMARKS row (no split)
BAR 10,600,630,3

; --- END GRID LINES ---

; -------- LABELS & VALUES (adjusted positions) --------
; Row 1 - W.O. NO. (left 30%), PART NAME (right 70%)
TEXT 20,90,"1",0,1,1,"W.O. NO.:"
TEXT 20,120,"2",0,1,1,"${woNumber}"
TEXT 210,90,"1",0,1,1,"PART NAME:"
TEXT 210,120,"2",0,1,1,"${partName}"

; Row 2 - DATE ISSUE | STOCK CODE | PROCESS CODE/NO.
TEXT 20,180,"1",0,1,1,"DATE ISSUE:"
TEXT 20,210,"2",0,1,1,"${dateIssue}"
TEXT 200,180,"1",0,1,1,"STOCK CODE:"
TEXT 200,210,"2",0,1,1,"${stockCode}"
TEXT 400,180,"1",0,1,1,"PROCESS CODE/NO.:"
TEXT 400,210,"2",0,1,1,"${processCode}"

; Row 3 - EMP NO. (30%), QTY (70%)
TEXT 20,270,"1",0,1,1,"EMP. NO.:"
TEXT 20,300,"2",0,1,1,"${empNo}"
TEXT 210,270,"1",0,1,1,"QTY.:"
TEXT 210,300,"2",0,1,1,"${qty}"

; Remarks row (full width)
TEXT 20,360,"1",0,1,1,"REMARKS:"
TEXT 20,400,"2",0,1,1,"${remarks}"

; (Optionally add barcode)
BARCODE 330,430,"128",80,1,0,2,2,"${woNumber}"

PRINT 1,1
  `;
}

console.log('End of file reached');

const server = app.listen(9090, () => console.log('Server running on port 9090'));