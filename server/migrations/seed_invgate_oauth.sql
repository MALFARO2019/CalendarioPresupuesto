-- ================================================================
-- Script: Insertar/Actualizar credenciales OAuth InvGate
-- Ejecutar en la base de datos KPIsRosti_InvGate
-- ================================================================

USE KPIsRosti_InvGate;
GO

-- Ver estado actual de la tabla
PRINT 'Estado actual de InvgateConfig:';
SELECT ConfigKey, LEFT(ISNULL(ConfigValue,'(null)'), 30) as ConfigValuePreview, LEN(ISNULL(ConfigValue,'')) as Len
FROM InvgateConfig
ORDER BY ConfigKey;
GO

-- Upsert CLIENT_ID
IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey = 'CLIENT_ID')
    UPDATE InvgateConfig SET ConfigValue = '019c6eb1-0ee4-723d-91ce-5e547b33ab3b' WHERE ConfigKey = 'CLIENT_ID';
ELSE
    INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES ('CLIENT_ID', '019c6eb1-0ee4-723d-91ce-5e547b33ab3b');
PRINT '✅ CLIENT_ID guardado';

-- Upsert CLIENT_SECRET
IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey = 'CLIENT_SECRET')
    UPDATE InvgateConfig SET ConfigValue = 'n3Pb449eA[04!o<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP' WHERE ConfigKey = 'CLIENT_SECRET';
ELSE
    INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES ('CLIENT_SECRET', 'n3Pb449eA[04!o<#zRznlq!jtGlEu,~63wTUpO@0wJjLqVXi.gzZqXk8-=DrzUsP');
PRINT '✅ CLIENT_SECRET guardado';

-- Upsert TOKEN_URL
IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey = 'TOKEN_URL')
    UPDATE InvgateConfig SET ConfigValue = 'https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token' WHERE ConfigKey = 'TOKEN_URL';
ELSE
    INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES ('TOKEN_URL', 'https://rostipollos.cloud.invgate.net/oauth/v2/0/access_token');
PRINT '✅ TOKEN_URL guardado';

-- Upsert API_BASE_URL
IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey = 'API_BASE_URL')
    UPDATE InvgateConfig SET ConfigValue = 'https://rostipollos.cloud.invgate.net/api/v2' WHERE ConfigKey = 'API_BASE_URL';
ELSE
    INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES ('API_BASE_URL', 'https://rostipollos.cloud.invgate.net/api/v2');
PRINT '✅ API_BASE_URL guardado';

-- Upsert SYNC_ENABLED
IF EXISTS (SELECT 1 FROM InvgateConfig WHERE ConfigKey = 'SYNC_ENABLED')
    UPDATE InvgateConfig SET ConfigValue = 'true' WHERE ConfigKey = 'SYNC_ENABLED';
ELSE
    INSERT INTO InvgateConfig (ConfigKey, ConfigValue) VALUES ('SYNC_ENABLED', 'true');
PRINT '✅ SYNC_ENABLED guardado';

GO

-- Verificar resultado final
PRINT '';
PRINT 'Estado FINAL de InvgateConfig:';
SELECT ConfigKey, LEFT(ISNULL(ConfigValue,'(null)'), 40) as ConfigValuePreview, LEN(ISNULL(ConfigValue,'')) as Len
FROM InvgateConfig
ORDER BY ConfigKey;
GO
