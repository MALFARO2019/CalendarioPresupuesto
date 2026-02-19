const cron = require('node-cron');
const invgateSyncService = require('../services/invgateSyncService');
const invgateDb = require('../invgateDb');

async function getConfigValue(key) {
    try {
        const pool = await invgateDb.getInvgatePool();
        const result = await pool.request()
            .input('key', invgateDb.sql.NVarChar, key)
            .query('SELECT ConfigValue FROM InvgateConfig WHERE ConfigKey = @key');
        return result.recordset[0]?.ConfigValue || null;
    } catch (e) {
        return null;
    }
}

class InvGateCronJob {
    constructor() {
        this.cronJob = null;
        this.isRunning = false;
        this.currentSchedule = null;
    }

    async start() {
        try {
            const syncEnabled = await getConfigValue('SYNC_ENABLED');
            const syncIntervalHours = await getConfigValue('SYNC_INTERVAL_HOURS');

            if (syncEnabled !== 'true') {
                console.log('⏸️ InvGate automatic sync is disabled');
                this.stop();
                return;
            }

            const interval = parseInt(syncIntervalHours) || 1;

            // Create cron expression based on interval
            // Every N hours: at minute 0
            let cronExpression;
            if (interval === 1) {
                cronExpression = '0 * * * *'; // Every hour
            } else if (interval === 24) {
                cronExpression = '0 0 * * *'; // Daily at midnight
            } else if (interval > 1 && interval < 24) {
                cronExpression = `0 */${interval} * * *`; // Every N hours
            } else {
                cronExpression = '0 * * * *'; // Default to hourly
            }

            // Stop existing job if running
            if (this.cronJob) {
                this.stop();
            }

            console.log(`⏰ Starting InvGate sync cron job: every ${interval} hour(s)`);
            console.log(`   Cron expression: ${cronExpression}`);

            this.cronJob = cron.schedule(cronExpression, async () => {
                if (this.isRunning) {
                    console.log('⏭️ Skipping sync - previous sync still running');
                    return;
                }

                this.isRunning = true;
                console.log('');
                console.log('⏰ Cron triggered - Starting automatic InvGate sync');

                try {
                    // Always use incremental sync for automatic syncs
                    await invgateSyncService.incrementalSync('CRON');
                    console.log('✅ Automatic sync completed successfully');
                } catch (err) {
                    console.error('❌ Automatic sync failed:', err.message);
                } finally {
                    this.isRunning = false;
                }
            });

            this.currentSchedule = cronExpression;
            console.log('✅ InvGate cron job started successfully');

        } catch (err) {
            console.error('❌ Failed to start InvGate cron job:', err);
        }
    }

    /**
     * Stop the cron job
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            this.currentSchedule = null;
            console.log('🛑 InvGate cron job stopped');
        }
    }

    /**
     * Restart the cron job (useful when configuration changes)
     */
    async restart() {
        console.log('🔄 Restarting InvGate cron job...');
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
            schedule: this.currentSchedule
        };
    }
}

// Export singleton instance
module.exports = new InvGateCronJob();
