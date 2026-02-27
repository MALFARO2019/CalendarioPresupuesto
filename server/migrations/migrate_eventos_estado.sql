-- ==========================================
-- Migration: Añadir Estados a DIM_EVENTOS_FECHAS
-- ==========================================

USE RP_BI_RESUMENES;
GO

IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'DIM_EVENTOS_FECHAS' AND COLUMN_NAME = 'Estado'
)
BEGIN
    ALTER TABLE DIM_EVENTOS_FECHAS ADD Estado VARCHAR(20) DEFAULT ('Pendiente');
    
    -- Los eventos existentes se consideran aprobados
    EXEC('UPDATE DIM_EVENTOS_FECHAS SET Estado = ''Aprobado'' WHERE Estado IS NULL OR Estado = ''Pendiente''');
    PRINT 'Columna Estado añadida a DIM_EVENTOS_FECHAS';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'DIM_EVENTOS_FECHAS' AND COLUMN_NAME = 'UsuarioAprueba'
)
BEGIN
    ALTER TABLE DIM_EVENTOS_FECHAS ADD UsuarioAprueba NVARCHAR(200) NULL;
    PRINT 'Columna UsuarioAprueba añadida a DIM_EVENTOS_FECHAS';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'DIM_EVENTOS_FECHAS' AND COLUMN_NAME = 'MotivoRechazo'
)
BEGIN
    ALTER TABLE DIM_EVENTOS_FECHAS ADD MotivoRechazo NVARCHAR(MAX) NULL;
    PRINT 'Columna MotivoRechazo añadida a DIM_EVENTOS_FECHAS';
END
GO
