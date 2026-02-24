-- Migration: Add DuracionUltimoCalculo column to track recalculation duration
-- This column stores the last recalculation duration in seconds

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[MODELO_PRESUPUESTO_CONFIG]') 
    AND name = 'DuracionUltimoCalculo'
)
BEGIN
    ALTER TABLE [dbo].[MODELO_PRESUPUESTO_CONFIG] 
        ADD [DuracionUltimoCalculo] INT NULL;
    PRINT 'Added DuracionUltimoCalculo column to MODELO_PRESUPUESTO_CONFIG';
END
GO
