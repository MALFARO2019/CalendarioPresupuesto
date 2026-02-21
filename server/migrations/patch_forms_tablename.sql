-- Patch: Add TableName column to FormsSources
-- Required by formsDynamicTable.js to store the Frm_* table name per source
USE KPIsRosti_WForms;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('FormsSources') AND name = 'TableName'
)
BEGIN
    ALTER TABLE FormsSources ADD TableName NVARCHAR(200) NULL;
    PRINT '✅ Added TableName column to FormsSources';
END
ELSE
BEGIN
    PRINT 'ℹ️ TableName column already exists';
END
GO
