USE [RP_BI_RESUMENES]
GO

-- Add user tracking columns to DIM_EVENTOS_FECHAS table
-- This allows tracking who made changes and when

-- Check if columns already exist before adding them
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[DIM_EVENTOS_FECHAS]') AND name = 'USUARIO_MODIFICACION')
BEGIN
    ALTER TABLE [dbo].[DIM_EVENTOS_FECHAS]
    ADD [USUARIO_MODIFICACION] [nvarchar](200) NULL;
    PRINT 'Column USUARIO_MODIFICACION added successfully';
END
ELSE
BEGIN
    PRINT 'Column USUARIO_MODIFICACION already exists';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[DIM_EVENTOS_FECHAS]') AND name = 'FECHA_MODIFICACION')
BEGIN
    ALTER TABLE [dbo].[DIM_EVENTOS_FECHAS]
    ADD [FECHA_MODIFICACION] [datetime] NULL;
    PRINT 'Column FECHA_MODIFICACION added successfully';
END
ELSE
BEGIN
    PRINT 'Column FECHA_MODIFICACION already exists';
END

GO

-- Verify the columns were added
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'DIM_EVENTOS_FECHAS'
ORDER BY ORDINAL_POSITION;

PRINT 'Migration completed successfully';
GO
