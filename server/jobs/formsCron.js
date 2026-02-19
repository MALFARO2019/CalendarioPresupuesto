const cron = require('node-cron');
const formsSyncService = require('../services/formsSyncService');
const formsService = require('../services/formsService');

/**
 * Forms Cron Job - Handles scheduled automatic synchronization
 * Pattern follows invgateCron.js structure
 */
class FormsCronJob {
    constructor() {
        this.job = null;
        this.isRunning = false;
    }

    /**
     * Start cron job based on configuration
     */
    async start() {
        try {
            // Get configuration from database
            const enabled = await formsService.getConfig('SYNC_ENABLED');
            const intervalHours = await formsService.getConfig('SYNC_INTERVAL_HOURS');

            if (enabled !== 'true') {
                console.log('⏸️ Forms sync cron is disabled');
                return;
            }

            const hours = parseInt(intervalHours) || 1;

            // Create cron expression based on interval
            let cronExpression;
            if (hours === 1) {
                cronExpression = '0 * * * *'; // Every hour
            } else if (hours === 6) {
                cronExpression = '0 */6 * * *'; // Every 6 hours
            } else if (hours === 12) {
                cronExpression = '0 */12 * * *'; // Every 12 hours
            } else if (hours === 24) {
                cronExpression = '0 0 * * *'; // Daily at midnight
            } else {
                // Custom interval
                cronExpression = `0 */${hours} * * *`;
            }

            // Stop existing job if running
            if (this.job) {
                this.job.stop();
            }

            // Create and start new job
            this.job = cron.schedule(cronExpression, async () => {
                if (this.isRunning) {
                    console.log('⏭️ Previous Forms sync still running, skipping this execution');
                    return;
                }

                this.isRunning = true;
                console.log('⏰ Forms sync cron triggered');

                try {
                    await formsSyncService.incrementalSync('CRON');
                } catch (error) {
                    console.error('❌ Forms cron sync error:', error.message);
                } finally {
                    this.isRunning = false;
                }
            });

            console.log(`✅ Forms sync cron started - Running every ${hours} hour(s)`);
            console.log(`   Cron expression: ${cronExpression}`);

        } catch (error) {
            console.error('❌ Error starting Forms cron job:', error.message);
        }
    }

    /**
     * Stop cron job
     */
    stop() {
        if (this.job) {
            this.job.stop();
            console.log('🛑 Forms sync cron stopped');
        }
    }

    /**
     * Restart cron job
     */
    async restart() {
        console.log('🔄 Restarting Forms sync cron...');
        this.stop();
        await this.start();
    }

    /**
     * Get current cron job status
     */
    async getStatus() {
        const enabled = await formsService.getConfig('SYNC_ENABLED');
        const intervalHours = await formsService.getConfig('SYNC_INTERVAL_HOURS');
        const lastSyncDate = await formsService.getConfig('LAST_SYNC_DATE');

        return {
            enabled: enabled === 'true',
            intervalHours: parseInt(intervalHours) || 1,
            lastSyncDate: lastSyncDate || null,
            isJobRunning: this.job ? true : false,
            isSyncInProgress: this.isRunning
        };
    }

    /**
     * Manually trigger sync (for testing or manual execution)
     */
    async triggerManualSync(type = 'INCREMENTAL', initiatedBy = 'MANUAL') {
        if (this.isRunning) {
            return {
                success: false,
                message: 'Sync already in progress'
            };
        }

        this.isRunning = true;
        try {
            const result = type === 'FULL'
                ? await formsSyncService.fullSync(initiatedBy)
                : await formsSyncService.incrementalSync(initiatedBy);

            return result;
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        } finally {
            this.isRunning = false;
        }
    }
}

module.exports = new FormsCronJob();
