-- Patch: Ensure SERVICE_ACCOUNT key exists in FormsConfig
-- Run this if the SERVICE_ACCOUNT field is blank in the Forms Azure AD config screen

USE KPIsRosti_WForms;
GO

-- Insert SERVICE_ACCOUNT row if it doesn't exist (MERGE so safe to re-run)
MERGE FormsConfig AS target
USING (SELECT 'SERVICE_ACCOUNT' AS ConfigKey) AS source
ON target.ConfigKey = source.ConfigKey
WHEN NOT MATCHED THEN
    INSERT (ConfigKey, ConfigValue, Descripcion, UpdatedBy)
    VALUES ('SERVICE_ACCOUNT', '', 'Correo cuenta de servicio para acceder a Excel via Graph API', 'PATCH');

PRINT '✅ SERVICE_ACCOUNT key ensured in FormsConfig';

-- Show current config (excluding secret value for security)
SELECT 
    ConfigKey,
    CASE 
        WHEN ConfigKey = 'CLIENT_SECRET' THEN '***HIDDEN***'
        ELSE ConfigValue 
    END AS ConfigValue,
    UpdatedAt,
    UpdatedBy
FROM FormsConfig
ORDER BY ConfigKey;
GO
