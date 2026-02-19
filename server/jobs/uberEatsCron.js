/**
 * uberEatsCron.js
 * Daily scheduled sync for Uber Eats reports
 * Pattern mirrors invgateCron.js
 */
const cron = require('node-cron');
const uberEatsService = require('../services/uberEatsService');
const { getUberEatsPool, sql } = require('../uberEatsDb');

class UberEatsCronJob {
    constructor() {
        this.cronJob = null;
        this.isRunning = false;
        this.currentSchedule = null;
    }

    async start() {
        try {
            const pool = await getUberEatsPool();

            const syncResult = await pool.request().query(
                `SELECT ConfigKey, ConfigValue FROM UberEatsConfig WHERE ConfigKey IN ('SYNC_ENABLED','SYNC_HOUR')`
            );
            const cfg = {};
            syncResult.recordset.forEach(r => { cfg[r.ConfigKey] = r.ConfigValue; });

            if (cfg.SYNC_ENABLED !== 'true') {
                console.log('⏸️ UberEats automatic sync is disabled');
                this.stop();
                return;
            }

            const hour = parseInt(cfg.SYNC_HOUR ?? '3');
            const cronExpression = `0 ${hour} * * *`;

            if (this.cronJob) this.stop();

            console.log(`⏰ Starting UberEats sync cron: daily at ${hour}:00`);
            this.cronJob = cron.schedule(cronExpression, async () => {
                if (this.isRunning) {
                    console.log('⏭️ Skipping UberEats sync - previous still running');
                    return;
                }
                this.isRunning = true;
                console.log('\n⏰ Cron triggered - Starting UberEats daily sync');
                try {
                    const result = await uberEatsService.syncDailyReports('CRON');
                    console.log(`✅ UberEats auto sync done: ${result.totalSaved} records for ${result.date}`);
                } catch (err) {
                    console.error('❌ UberEats auto sync failed:', err.message);
                } finally {
                    this.isRunning = false;
                }
            });

            this.currentSchedule = cronExpression;
            console.log('✅ UberEats cron job started');
        } catch (err) {
            console.error('❌ Failed to start UberEats cron:', err.message);
        }
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            this.currentSchedule = null;
            console.log('🛑 UberEats cron stopped');
        }
    }

    async restart() {
        this.stop();
        await this.start();
    }

    getStatus() {
        return {
            isActive: this.cronJob !== null,
            isRunning: this.isRunning,
            schedule: this.currentSchedule
        };
    }
}

module.exports = new UberEatsCronJob();
