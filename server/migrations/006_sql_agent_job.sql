-- ==========================================
-- SQL Agent Job: Modelo Presupuesto - Calculo Diario
-- ==========================================
-- Creates a SQL Server Agent Job that runs SP_CALCULAR_PRESUPUESTO
-- daily at the configured time (default 06:00 AM).
-- Target: RP_BI_RESUMENES on 10.29.1.14
-- ==========================================

USE msdb;
GO

-- Drop existing job if it exists
IF EXISTS (SELECT * FROM msdb.dbo.sysjobs WHERE name = N'Modelo Presupuesto - Calculo Diario')
BEGIN
    EXEC msdb.dbo.sp_delete_job @job_name = N'Modelo Presupuesto - Calculo Diario';
END
GO

-- Create the job
DECLARE @jobId BINARY(16);
EXEC msdb.dbo.sp_add_job
    @job_name = N'Modelo Presupuesto - Calculo Diario',
    @enabled = 1,
    @description = N'Ejecuta el cálculo del presupuesto diario. Crea snapshot de versión, calcula distribución diaria, actualiza datos reales y acumulados.',
    @category_name = N'[Uncategorized (Local)]',
    @owner_login_name = N'sa',
    @job_id = @jobId OUTPUT;

-- Add step 1: Execute SP_CALCULAR_PRESUPUESTO
EXEC msdb.dbo.sp_add_jobstep
    @job_id = @jobId,
    @step_name = N'Ejecutar SP_CALCULAR_PRESUPUESTO',
    @step_id = 1,
    @subsystem = N'TSQL',
    @command = N'
-- Read active config and execute calculation
DECLARE @nombre NVARCHAR(100), @tabla NVARCHAR(100);
SELECT TOP 1 @nombre = NombrePresupuesto, @tabla = TablaDestino
FROM RP_BI_RESUMENES.dbo.MODELO_PRESUPUESTO_CONFIG
WHERE Activo = 1;

IF @nombre IS NOT NULL
BEGIN
    EXEC RP_BI_RESUMENES.dbo.SP_CALCULAR_PRESUPUESTO
        @NombrePresupuesto = @nombre,
        @TablaDestino = @tabla,
        @Usuario = ''JOB'',
        @CrearVersion = 1;
END
',
    @database_name = N'RP_BI_RESUMENES',
    @on_success_action = 1,  -- Quit with success
    @on_fail_action = 2,     -- Quit with failure
    @retry_attempts = 1,
    @retry_interval = 5;     -- 5 min retry

-- Create schedule: Daily at 06:00 AM
EXEC msdb.dbo.sp_add_jobschedule
    @job_id = @jobId,
    @name = N'Diario 06:00 AM',
    @enabled = 1,
    @freq_type = 4,             -- Daily
    @freq_interval = 1,         -- Every 1 day
    @freq_subday_type = 1,      -- At specified time
    @active_start_time = 060000; -- 06:00:00 AM

-- Add to local server
EXEC msdb.dbo.sp_add_jobserver
    @job_id = @jobId,
    @server_name = N'(local)';

GO

PRINT '✅ SQL Agent Job "Modelo Presupuesto - Calculo Diario" created successfully';
PRINT 'Schedule: Daily at 06:00 AM';
PRINT 'To change the schedule, modify the job in SQL Server Agent or update HoraCalculo in MODELO_PRESUPUESTO_CONFIG';
GO
