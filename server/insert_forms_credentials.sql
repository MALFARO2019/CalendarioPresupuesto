-- Insertar o actualizar credenciales Azure AD en FormsConfig
USE WindowsFormsData;
GO

-- Eliminar credenciales existentes
DELETE FROM FormsConfig WHERE ConfigKey IN ('TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SYNC_ENABLED', 'SYNC_INTERVAL_HOURS', 'FORM_IDS');

-- Insertar credenciales actualizadas
INSERT INTO FormsConfig (ConfigKey, ConfigValue, Descripcion, UpdatedBy)
VALUES 
    ('TENANT_ID', '70dff046e-e545-44c7-ae8c-21c53272ee6e', 'Azure AD Tenant ID', 'SYSTEM'),
    ('CLIENT_ID', '44490c35-76d8-451c-a10f-05c526df8e38', 'Azure AD Application (Client) ID', 'SYSTEM'),
    ('CLIENT_SECRET', 'SET_ME_MANUALLY_OR_USE_API', 'Azure AD Client Secret', 'SYSTEM'),
    ('SYNC_ENABLED', 'false', 'Enable automatic sync (true/false)', 'SYSTEM'),
    ('SYNC_INTERVAL_HOURS', '6', 'Sync interval in hours (1, 6, 12, 24)', 'SYSTEM'),
    ('FORM_IDS', '[]', 'JSON array of form IDs to sync', 'SYSTEM');

PRINT '✅ Credenciales Azure AD insertadas correctamente';

-- Verificar
SELECT ConfigKey, 
       CASE 
           WHEN ConfigKey = 'CLIENT_SECRET' THEN '••••••••' 
           ELSE LEFT(ConfigValue, 50) 
       END as ConfigValue,
       Descripcion,
       UpdatedAt
FROM FormsConfig
WHERE ConfigKey IN ('TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SYNC_ENABLED');
GO
