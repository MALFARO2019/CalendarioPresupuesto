/**
 * Deploy SP_CALCULAR_PRESUPUESTO to the database
 * Run: node deploy_sp.js
 */
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { sql, poolPromise } = require('./db');

async function deploySP() {
    try {
        console.log('🔗 Connecting to database...');
        const pool = await poolPromise;

        // Read the SP SQL file
        const spFile = path.join(__dirname, 'migrations', '003_sp_calcular_presupuesto.sql');
        let spSql = fs.readFileSync(spFile, 'utf-8');

        // Remove USE and GO statements (not valid in sp_executesql)
        // Split by GO and execute each batch
        const batches = spSql.split(/^GO$/gim).filter(b => b.trim().length > 0);

        for (let i = 0; i < batches.length; i++) {
            let batch = batches[i].trim();
            // Skip USE statements
            if (batch.match(/^USE\s/i)) {
                console.log(`⏭️  Skipping USE statement (batch ${i + 1})`);
                continue;
            }
            // Skip PRINT statements by themselves
            if (batch.match(/^PRINT\s/i) && batch.split('\n').length <= 2) {
                console.log(`⏭️  Skipping PRINT statement (batch ${i + 1})`);
                continue;
            }

            console.log(`⚙️  Executing batch ${i + 1}/${batches.length}...`);
            const request = pool.request();
            request.timeout = 120000; // 2 minutes
            await request.query(batch);
            console.log(`✅  Batch ${i + 1} completed`);
        }

        console.log('\n✅ SP_CALCULAR_PRESUPUESTO deployed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error deploying SP:', err.message);
        process.exit(1);
    }
}

deploySP();
