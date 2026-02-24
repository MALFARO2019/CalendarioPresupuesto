-- ==========================================
-- SQL Agent Job: Modelo Presupuesto - Calculo Diario
-- ==========================================
-- Creates a SQL Server Agent Job that runs SP_CALCULAR_PRESUPUESTO
-- for ALL configs with EjecutarEnJob = 1 AND Activo = 1.
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
    @description = N'Ejecuta SP_CALCULAR_PRESUPUESTO para TODAS las configuraciones activas con EjecutarEnJob=1. Crea snapshot de versión, calcula distribución diaria, actualiza datos reales y acumulados.',
    @category_name = N'[Uncategorized (Local)]',
    @owner_login_name = N'sa',
    @job_id = @jobId OUTPUT;

-- Add step 1: Execute SP_CALCULAR_PRESUPUESTO for all enabled configs
EXEC msdb.dbo.sp_add_jobstep
    @job_id = @jobId,
    @step_name = N'Ejecutar SP_CALCULAR_PRESUPUESTO (todas las configs)',
    @step_id = 1,
    @subsystem = N'TSQL',
    @command = N'
-- ================================================
-- Iterate over ALL configs with EjecutarEnJob = 1
-- ================================================
SET NOCOUNT ON;

DECLARE @nombre NVARCHAR(100), @tabla NVARCHAR(100), @configId INT;
DECLARE @startTime DATETIME, @msg NVARCHAR(500);

DECLARE config_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT Id, NombrePresupuesto, TablaDestino
    FROM RP_BI_RESUMENES.dbo.MODELO_PRESUPUESTO_CONFIG
    WHERE EjecutarEnJob = 1 AND Activo = 1
    ORDER BY Id;

OPEN config_cursor;
FETCH NEXT FROM config_cursor INTO @configId, @nombre, @tabla;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @startTime = GETDATE();
    SET @msg = N''Ejecutando SP para: '' + @nombre + N'' → '' + @tabla;
    RAISERROR(@msg, 0, 1) WITH NOWAIT;

    BEGIN TRY
        EXEC RP_BI_RESUMENES.dbo.SP_CALCULAR_PRESUPUESTO
            @NombrePresupuesto = @nombre,
            @TablaDestino = @tabla,
            @Usuario = ''JOB_SQL_AGENT'',
            @CrearVersion = 1;

        SET @msg = N''✅ Completado: '' + @nombre + N'' en '' 
            + CAST(DATEDIFF(SECOND, @startTime, GETDATE()) AS NVARCHAR(10)) + N'' segundos'';
        RAISERROR(@msg, 0, 1) WITH NOWAIT;
    END TRY
    BEGIN CATCH
        SET @msg = N''❌ Error en '' + @nombre + N'': '' + ERROR_MESSAGE();
        RAISERROR(@msg, 0, 1) WITH NOWAIT;
        -- Continue with next config, do not abort
    END CATCH

    FETCH NEXT FROM config_cursor INTO @configId, @nombre, @tabla;
END

CLOSE config_cursor;
DEALLOCATE config_cursor;

RAISERROR(N''Job completado.'', 0, 1) WITH NOWAIT;
',
    @database_name = N'RP_BI_RESUMENES',
    @on_success_action = 1,  -- Quit with success
    @on_fail_action = 2,     -- Quit with failure
    @retry_attempts = 1,
    @retry_interval = 5;     -- 5 min retry

-- Create schedule: Daily at 23:30 (matching Producción config)
EXEC msdb.dbo.sp_add_jobschedule
    @job_id = @jobId,
    @name = N'Diario 23:30',
    @enabled = 1,
    @freq_type = 4,             -- Daily
    @freq_interval = 1,         -- Every 1 day
    @freq_subday_type = 1,      -- At specified time
    @active_start_time = 233000; -- 23:30:00

-- Add to local server
EXEC msdb.dbo.sp_add_jobserver
    @job_id = @jobId,
    @server_name = N'(local)';

GO

PRINT '✅ SQL Agent Job "Modelo Presupuesto - Calculo Diario" created successfully';
PRINT 'Schedule: Daily at 23:30';
PRINT 'Processes ALL configs with EjecutarEnJob = 1 AND Activo = 1';
PRINT 'Usuario: JOB_SQL_AGENT';
PRINT '';
PRINT 'To change the schedule, modify the job in SQL Server Agent';
PRINT 'or update HoraCalculo in MODELO_PRESUPUESTO_CONFIG.';
GO
