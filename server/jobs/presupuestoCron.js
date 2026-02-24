/**
 * presupuestoCron.js
 * FALLBACK scheduled budget recalculation
 * 
 * Primary executor: SQL Agent Job "Modelo Presupuesto - Calculo Diario"
 * This Node.js cron acts as FALLBACK: runs 30 minutes after HoraCalculo
 * and checks UltimoCalculo before executing.
 * 
 * Logic: If UltimoCalculo is already today → skip (SQL Agent did it).
 *        If not → execute as fallback.
 */
const cron = require('node-cron');
const { poolPromise, sql } = require('../db');

const FALLBACK_DELAY_MINUTES = 30;

class PresupuestoCronJob {
    constructor() {
        this.cronJob = null;
        this.isRunning = false;
        this.currentSchedule = null;
        this.lastRun = null;
        this.lastResult = null;
        this.mode = 'fallback'; // always fallback — SQL Agent is primary
    }

    /**
     * Start the fallback cron job based on MODELO_PRESUPUESTO_CONFIG
     * Schedules 30 minutes AFTER HoraCalculo to give SQL Agent time
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
                console.log('⏸️  Budget fallback: no configs have EjecutarEnJob enabled');
                this.stop();
                return;
            }

            // Use the earliest HoraCalculo among enabled configs + FALLBACK_DELAY
            const configs = result.recordset;
            const hora = configs[0].HoraCalculo || '04:00';
            const [hours, minutes] = hora.split(':').map(Number);

            // Add fallback delay
            let fallbackMinutes = (minutes || 0) + FALLBACK_DELAY_MINUTES;
            let fallbackHours = hours || 4;
            if (fallbackMinutes >= 60) {
                fallbackHours = (fallbackHours + Math.floor(fallbackMinutes / 60)) % 24;
                fallbackMinutes = fallbackMinutes % 60;
            }

            // Cron expression: "MM HH * * *" (every day at HH:MM)
            const cronExpression = `${fallbackMinutes} ${fallbackHours} * * *`;
            const fallbackTime = `${String(fallbackHours).padStart(2, '0')}:${String(fallbackMinutes).padStart(2, '0')}`;

            // Stop existing job if running
            if (this.cronJob) {
                this.stop();
            }

            console.log('');
            console.log('═══════════════════════════════════════════════');
            console.log('  📋 Budget Recalculation — FALLBACK MODE');
            console.log('═══════════════════════════════════════════════');
            console.log(`  Primary: SQL Agent Job "Modelo Presupuesto - Calculo Diario"`);
            console.log(`  SP:      SP_CALCULAR_PRESUPUESTO`);
            console.log(`  SQL Agent runs at:  ${hora}`);
            console.log(`  Fallback runs at:   ${fallbackTime} (+${FALLBACK_DELAY_MINUTES}min)`);
            console.log(`  Cron expression:    ${cronExpression}`);
            console.log(`  Configs: ${configs.map(c => c.NombrePresupuesto).join(', ')}`);
            console.log('═══════════════════════════════════════════════');
            console.log('');

            this.cronJob = cron.schedule(cronExpression, async () => {
                if (this.isRunning) {
                    console.log('⏭️  Skipping budget fallback — previous run still active');
                    return;
                }

                this.isRunning = true;
                this.lastRun = new Date();
                console.log('');
                console.log('⏰ Fallback cron triggered — checking if SQL Agent already ran today...');

                try {
                    await this._executeForAllConfigs();
                    console.log('✅ Fallback budget check completed');
                } catch (err) {
                    console.error('❌ Fallback budget check failed:', err.message);
                    this.lastResult = { success: false, error: err.message, timestamp: new Date() };
                } finally {
                    this.isRunning = false;
                }
            });

            this.currentSchedule = cronExpression;
            console.log('✅ Budget fallback cron job started');

        } catch (err) {
            console.error('❌ Failed to start budget fallback cron:', err.message);
        }
    }

    /**
     * Execute SP_CALCULAR_PRESUPUESTO for configs with EjecutarEnJob = 1,
     * but ONLY if UltimoCalculo is NOT today (i.e., SQL Agent didn't run).
     */
    async _executeForAllConfigs() {
        const pool = await poolPromise;

        const result = await pool.request().query(`
            SELECT Id, NombrePresupuesto, TablaDestino, AnoModelo, UltimoCalculo
            FROM MODELO_PRESUPUESTO_CONFIG
            WHERE EjecutarEnJob = 1 AND Activo = 1
            ORDER BY Id
        `);

        const configs = result.recordset;
        const results = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const config of configs) {
            // Check if UltimoCalculo is already today
            const ultimoCalculo = config.UltimoCalculo ? new Date(config.UltimoCalculo) : null;
            let alreadyRanToday = false;

            if (ultimoCalculo) {
                const ultimoDate = new Date(ultimoCalculo);
                ultimoDate.setHours(0, 0, 0, 0);
                alreadyRanToday = ultimoDate.getTime() === today.getTime();
            }

            if (alreadyRanToday) {
                const runTime = ultimoCalculo.toLocaleString('es-CR');
                console.log(`✅ "${config.NombrePresupuesto}" — SQL Agent already ran today (${runTime}). Skipping.`);
                results.push({
                    config: config.NombrePresupuesto,
                    success: true,
                    skipped: true,
                    reason: `SQL Agent ran at ${runTime}`
                });
                continue;
            }

            // SQL Agent didn't run — execute as fallback
            console.log(`⚠️  "${config.NombrePresupuesto}" — SQL Agent did NOT run today. Executing fallback...`);
            console.log(`   📊 Recalculating: "${config.NombrePresupuesto}" → ${config.TablaDestino}`);
            const startTime = Date.now();

            try {
                const request = pool.request();
                request.timeout = 600000; // 10 min per config
                request.input('NombrePresupuesto', sql.NVarChar(100), config.NombrePresupuesto);
                request.input('TablaDestino', sql.NVarChar(100), config.TablaDestino);
                request.input('Usuario', sql.NVarChar(200), 'JOB_NODE_FALLBACK');
                request.input('CrearVersion', sql.Bit, 1);

                const spResult = await request.execute('SP_CALCULAR_PRESUPUESTO');
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const totalRows = spResult.recordset?.[0]?.TotalRegistros || 0;

                console.log(`   ✅ Fallback done in ${elapsed}s — ${totalRows} records`);
                results.push({
                    config: config.NombrePresupuesto,
                    success: true,
                    skipped: false,
                    totalRows,
                    elapsed: `${elapsed}s`,
                    executedBy: 'NODE_FALLBACK'
                });

            } catch (err) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.error(`   ❌ Fallback failed after ${elapsed}s: ${err.message}`);
                results.push({
                    config: config.NombrePresupuesto,
                    success: false,
                    skipped: false,
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
            console.log('🛑 Budget fallback cron job stopped');
        }
    }

    /**
     * Restart the cron job (useful when configuration changes)
     */
    async restart() {
        console.log('🔄 Restarting budget fallback cron job...');
        this.stop();
        await this.start();
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            mode: this.mode,
            isActive: this.cronJob !== null,
            isRunning: this.isRunning,
            schedule: this.currentSchedule,
            lastRun: this.lastRun,
            lastResult: this.lastResult,
            primaryExecutor: 'SQL Agent Job: Modelo Presupuesto - Calculo Diario',
            storedProcedure: 'SP_CALCULAR_PRESUPUESTO',
            fallbackDelayMinutes: FALLBACK_DELAY_MINUTES
        };
    }
}

// Export singleton
module.exports = new PresupuestoCronJob();
