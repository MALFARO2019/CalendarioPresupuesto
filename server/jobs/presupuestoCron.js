/**
 * presupuestoCron.js
 * Scheduled automatic budget recalculation
 * Pattern mirrors invgateCron.js
 */
const cron = require('node-cron');
const { poolPromise, sql } = require('../db');

class PresupuestoCronJob {
    constructor() {
        this.cronJob = null;
        this.isRunning = false;
        this.currentSchedule = null;
        this.lastRun = null;
        this.lastResult = null;
    }

    /**
     * Start the cron job based on MODELO_PRESUPUESTO_CONFIG
     * Reads all configs where EjecutarEnJob = 1 and schedules at HoraCalculo
     */
    async start() {
        try {
            const pool = await poolPromise;

            // Get configs with Job enabled
            const result = await pool.request().query(`
                SELECT Id, NombrePresupuesto, TablaDestino, HoraCalculo, AnoModelo
                FROM MODELO_PRESUPUESTO_CONFIG
                WHERE EjecutarEnJob = 1 AND Activo = 1
            `);

            if (result.recordset.length === 0) {
                console.log('⏸️  Budget job: no configs have EjecutarEnJob enabled');
                this.stop();
                return;
            }

            // Use the earliest HoraCalculo among enabled configs
            const configs = result.recordset;
            const hora = configs[0].HoraCalculo || '04:00';
            const [hours, minutes] = hora.split(':').map(Number);

            // Cron expression: "MM HH * * *" (every day at HH:MM)
            const cronExpression = `${minutes || 0} ${hours || 4} * * *`;

            // Stop existing job if running
            if (this.cronJob) {
                this.stop();
            }

            console.log(`⏰ Starting budget recalculation cron: daily at ${hora}`);
            console.log(`   Cron expression: ${cronExpression}`);
            console.log(`   Configs to run: ${configs.map(c => c.NombrePresupuesto).join(', ')}`);

            this.cronJob = cron.schedule(cronExpression, async () => {
                if (this.isRunning) {
                    console.log('⏭️  Skipping budget recalculation - previous run still active');
                    return;
                }

                this.isRunning = true;
                this.lastRun = new Date();
                console.log('');
                console.log('⏰ Cron triggered - Starting automatic budget recalculation');

                try {
                    await this._executeForAllConfigs();
                    console.log('✅ Automatic budget recalculation completed');
                } catch (err) {
                    console.error('❌ Automatic budget recalculation failed:', err.message);
                    this.lastResult = { success: false, error: err.message, timestamp: new Date() };
                } finally {
                    this.isRunning = false;
                }
            });

            this.currentSchedule = cronExpression;
            console.log('✅ Budget recalculation cron job started');

        } catch (err) {
            console.error('❌ Failed to start budget cron job:', err.message);
        }
    }

    /**
     * Execute SP_CALCULAR_PRESUPUESTO for all configs with EjecutarEnJob = 1
     */
    async _executeForAllConfigs() {
        const pool = await poolPromise;

        const result = await pool.request().query(`
            SELECT Id, NombrePresupuesto, TablaDestino, AnoModelo
            FROM MODELO_PRESUPUESTO_CONFIG
            WHERE EjecutarEnJob = 1 AND Activo = 1
            ORDER BY Id
        `);

        const configs = result.recordset;
        const results = [];

        for (const config of configs) {
            console.log(`📊 Recalculating: "${config.NombrePresupuesto}" → ${config.TablaDestino}`);
            const startTime = Date.now();

            try {
                const request = pool.request();
                request.timeout = 600000; // 10 min per config
                request.input('NombrePresupuesto', sql.NVarChar(100), config.NombrePresupuesto);
                request.input('TablaDestino', sql.NVarChar(100), config.TablaDestino);
                request.input('Usuario', sql.NVarChar(200), 'JOB');
                request.input('CrearVersion', sql.Bit, 1);

                const spResult = await request.execute('SP_CALCULAR_PRESUPUESTO');
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const totalRows = spResult.recordset?.[0]?.TotalRegistros || 0;

                console.log(`   ✅ Done in ${elapsed}s — ${totalRows} records`);
                results.push({
                    config: config.NombrePresupuesto,
                    success: true,
                    totalRows,
                    elapsed: `${elapsed}s`
                });

            } catch (err) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.error(`   ❌ Failed after ${elapsed}s: ${err.message}`);
                results.push({
                    config: config.NombrePresupuesto,
                    success: false,
                    error: err.message,
                    elapsed: `${elapsed}s`
                });
            }
        }

        this.lastResult = { success: results.every(r => r.success), results, timestamp: new Date() };
        return results;
    }

    /**
     * Stop the cron job
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            this.currentSchedule = null;
            console.log('🛑 Budget recalculation cron job stopped');
        }
    }

    /**
     * Restart the cron job (useful when configuration changes)
     */
    async restart() {
        console.log('🔄 Restarting budget recalculation cron job...');
        this.stop();
        await this.start();
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isActive: this.cronJob !== null,
            isRunning: this.isRunning,
            schedule: this.currentSchedule,
            lastRun: this.lastRun,
            lastResult: this.lastResult
        };
    }
}

// Export singleton
module.exports = new PresupuestoCronJob();
