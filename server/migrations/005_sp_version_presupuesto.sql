-- ==========================================
-- SP_VERSION_PRESUPUESTO
-- Creates/restores snapshot versions of budget data
-- ==========================================
-- Creates table snapshots (RSM_ALCANCE_DIARIO_vNN)
-- Maintains max 15 versions, deletes oldest when exceeded
-- Supports restore by NombrePresupuesto
-- ==========================================

USE RP_BI_RESUMENES;
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SP_VERSION_PRESUPUESTO]') AND type = 'P')
    DROP PROCEDURE [dbo].[SP_VERSION_PRESUPUESTO];
GO

CREATE PROCEDURE [dbo].[SP_VERSION_PRESUPUESTO]
    @NombrePresupuesto  NVARCHAR(100),
    @TablaDestino       NVARCHAR(100) = 'RSM_ALCANCE_DIARIO',
    @Usuario            NVARCHAR(200) = 'JOB',
    @Origen             NVARCHAR(50)  = 'Manual',  -- 'Job' / 'Manual' / 'Restore'
    @Modo               NVARCHAR(20)  = 'CREAR',    -- 'CREAR' / 'RESTAURAR'
    @VersionId          INT           = NULL,        -- Required for RESTAURAR
    @Notas              NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NumeroVersion INT;
    DECLARE @NombreTabla   NVARCHAR(200);
    DECLARE @TotalRegistros INT;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxVersiones  INT = 15;

    -- ============================================
    -- MODE: CREAR - Create a new version snapshot
    -- ============================================
    IF @Modo = 'CREAR'
    BEGIN
        BEGIN TRANSACTION;

        -- Determine next version number
        SELECT @NumeroVersion = ISNULL(MAX(NumeroVersion), 0) + 1
        FROM MODELO_PRESUPUESTO_VERSIONES
        WHERE NombrePresupuesto = @NombrePresupuesto;

        SET @NombreTabla = @TablaDestino + '_v' + CAST(@NumeroVersion AS NVARCHAR(10));

        -- Drop table if it somehow already exists
        SET @SQL = N'IF OBJECT_ID(''' + @NombreTabla + ''', ''U'') IS NOT NULL DROP TABLE [' + @NombreTabla + '];';
        EXEC sp_executesql @SQL;

        -- Create snapshot as copy of entire destination table
        SET @SQL = N'SELECT * INTO [' + @NombreTabla + '] FROM [' + @TablaDestino + '];';
        EXEC sp_executesql @SQL;

        -- Count records in snapshot
        SET @SQL = N'SELECT @cnt = COUNT(*) FROM [' + @NombreTabla + '];';
        EXEC sp_executesql @SQL, N'@cnt INT OUTPUT', @cnt = @TotalRegistros OUTPUT;

        -- Register version
        INSERT INTO MODELO_PRESUPUESTO_VERSIONES
            (NombrePresupuesto, NumeroVersion, NombreTabla, Usuario, Origen, TotalRegistros, Notas)
        VALUES
            (@NombrePresupuesto, @NumeroVersion, @NombreTabla, @Usuario, @Origen, @TotalRegistros, @Notas);

        -- Enforce max 15 versions: delete oldest if exceeded
        DECLARE @VersionCount INT;
        SELECT @VersionCount = COUNT(*)
        FROM MODELO_PRESUPUESTO_VERSIONES
        WHERE NombrePresupuesto = @NombrePresupuesto;

        WHILE @VersionCount > @MaxVersiones
        BEGIN
            DECLARE @OldestId INT;
            DECLARE @OldestTabla NVARCHAR(200);

            SELECT TOP 1
                @OldestId    = Id,
                @OldestTabla = NombreTabla
            FROM MODELO_PRESUPUESTO_VERSIONES
            WHERE NombrePresupuesto = @NombrePresupuesto
            ORDER BY NumeroVersion ASC;

            -- Drop the oldest snapshot table
            SET @SQL = N'IF OBJECT_ID(''' + @OldestTabla + ''', ''U'') IS NOT NULL DROP TABLE [' + @OldestTabla + '];';
            EXEC sp_executesql @SQL;

            -- Remove version record
            DELETE FROM MODELO_PRESUPUESTO_VERSIONES WHERE Id = @OldestId;

            SET @VersionCount = @VersionCount - 1;
        END

        COMMIT TRANSACTION;

        -- Return created version info
        SELECT @NumeroVersion AS NumeroVersion,
               @NombreTabla AS NombreTabla,
               @TotalRegistros AS TotalRegistros;
    END

    -- ============================================
    -- MODE: RESTAURAR - Restore from a version
    -- ============================================
    ELSE IF @Modo = 'RESTAURAR'
    BEGIN
        IF @VersionId IS NULL
        BEGIN
            RAISERROR('VersionId is required for RESTAURAR mode', 16, 1);
            RETURN;
        END

        -- Get version info
        DECLARE @RestoreTabla NVARCHAR(200);
        DECLARE @RestoreNombre NVARCHAR(100);

        SELECT @RestoreTabla  = NombreTabla,
               @RestoreNombre = NombrePresupuesto
        FROM MODELO_PRESUPUESTO_VERSIONES
        WHERE Id = @VersionId;

        IF @RestoreTabla IS NULL
        BEGIN
            RAISERROR('Version not found', 16, 1);
            RETURN;
        END

        -- Verify the snapshot table exists
        SET @SQL = N'IF OBJECT_ID(''' + @RestoreTabla + ''', ''U'') IS NULL BEGIN RAISERROR(''Snapshot table not found: ' + @RestoreTabla + ''', 16, 1); END';
        EXEC sp_executesql @SQL;

        BEGIN TRANSACTION;

        -- Create a new version snapshot of current state before restoring
        EXEC SP_VERSION_PRESUPUESTO
            @NombrePresupuesto = @NombrePresupuesto,
            @TablaDestino = @TablaDestino,
            @Usuario = @Usuario,
            @Origen = 'Pre-Restore',
            @Modo = 'CREAR',
            @Notas = 'Auto-snapshot before version restore';

        -- Delete current data for this NombrePresupuesto only
        SET @SQL = N'DELETE FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @RestoreNombre;

        -- Insert from snapshot (only records for this NombrePresupuesto)
        SET @SQL = N'INSERT INTO [' + @TablaDestino + '] SELECT * FROM [' + @RestoreTabla + '] WHERE NombrePresupuesto = @nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100)', @nombre = @RestoreNombre;

        -- Count restored records
        SET @SQL = N'SELECT @cnt = COUNT(*) FROM [' + @TablaDestino + '] WHERE NombrePresupuesto = @nombre;';
        EXEC sp_executesql @SQL, N'@nombre NVARCHAR(100), @cnt INT OUTPUT', @nombre = @RestoreNombre, @cnt = @TotalRegistros OUTPUT;

        -- Log in bitacora
        INSERT INTO MODELO_PRESUPUESTO_BITACORA
            (NombrePresupuesto, Usuario, Accion, Origen, Motivo, Detalle)
        VALUES
            (@NombrePresupuesto, @Usuario, 'Restore', 'Restore',
             'Restauración de versión ' + CAST(@VersionId AS NVARCHAR(10)),
             '{"versionId":' + CAST(@VersionId AS NVARCHAR(10)) + ',"tabla":"' + @RestoreTabla + '","registros":' + CAST(@TotalRegistros AS NVARCHAR(20)) + '}');

        COMMIT TRANSACTION;

        -- Return result
        SELECT @TotalRegistros AS TotalRegistros,
               @RestoreTabla AS TablaOrigen;
    END
    ELSE
    BEGIN
        RAISERROR('Invalid mode. Use CREAR or RESTAURAR', 16, 1);
    END
END
GO

PRINT '✅ SP_VERSION_PRESUPUESTO created successfully';
GO
