-- =============================================
-- Migration: Módulo de Reportes
-- Tablas: DIM_REPORTES, DIM_REPORTE_SUSCRIPCIONES, DIM_REPORTE_ACCESO
-- =============================================

-- 1. Catálogo de reportes (configurados por técnico)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DIM_REPORTES')
BEGIN
    CREATE TABLE DIM_REPORTES (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        Nombre NVARCHAR(200) NOT NULL,
        Descripcion NVARCHAR(500) NULL,
        Icono NVARCHAR(10) DEFAULT '📊',
        Categoria NVARCHAR(100) DEFAULT 'General',
        
        -- Query/Vista SQL que alimenta el reporte
        QuerySQL NVARCHAR(MAX) NOT NULL,
        
        -- Columnas a mostrar (JSON array): [{"field":"Local","label":"Local","format":"text"},{"field":"MontoReal","label":"Venta Real","format":"currency"}]
        Columnas NVARCHAR(MAX) NULL,
        
        -- Parámetros disponibles (JSON array): ["local","canal","kpi","fechaInicio","fechaFin"]
        Parametros NVARCHAR(MAX) NULL,
        
        -- Programación por defecto
        Frecuencia NVARCHAR(20) DEFAULT 'Diario', -- Diario, Semanal, Mensual
        HoraEnvio NVARCHAR(5) DEFAULT '07:00',    -- HH:MM
        DiaSemana INT NULL,                         -- 1=Lunes..7=Domingo (para Semanal)
        DiaMes INT NULL,                            -- 1-28 (para Mensual)
        
        -- Template
        FormatoSalida NVARCHAR(20) DEFAULT 'html', -- html, pdf
        TemplateAsunto NVARCHAR(500) NULL,          -- Template del subject del email
        TemplateEncabezado NVARCHAR(MAX) NULL,      -- HTML header custom
        
        -- Metadata
        Activo BIT DEFAULT 1,
        Orden INT DEFAULT 0,
        CreadoPor NVARCHAR(200) NULL,
        FechaCreacion DATETIME DEFAULT GETDATE(),
        ModificadoPor NVARCHAR(200) NULL,
        FechaModificacion DATETIME NULL
    );
    PRINT 'Tabla DIM_REPORTES creada';
END
GO

-- 2. Suscripciones de usuarios a reportes
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DIM_REPORTE_SUSCRIPCIONES')
BEGIN
    CREATE TABLE DIM_REPORTE_SUSCRIPCIONES (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        ReporteID INT NOT NULL,
        UsuarioID INT NOT NULL,
        
        -- Estado
        Activo BIT DEFAULT 1,
        
        -- Configuración personalizada del usuario
        EmailDestino NVARCHAR(200) NULL,        -- NULL = usar email del usuario
        FrecuenciaPersonal NVARCHAR(20) NULL,   -- NULL = usar frecuencia del reporte
        HoraEnvioPersonal NVARCHAR(5) NULL,     -- NULL = usar hora del reporte
        DiaSemanaPersonal INT NULL,
        DiaMesPersonal INT NULL,
        
        -- Parámetros fijos del usuario (JSON): {"local":"Restaurant01","canal":"Total"}
        ParametrosFijos NVARCHAR(MAX) NULL,
        
        -- Tracking
        UltimoEnvio DATETIME NULL,
        TotalEnvios INT DEFAULT 0,
        FechaSuscripcion DATETIME DEFAULT GETDATE(),
        
        CONSTRAINT FK_Suscripcion_Reporte FOREIGN KEY (ReporteID) REFERENCES DIM_REPORTES(ID) ON DELETE CASCADE,
        CONSTRAINT FK_Suscripcion_Usuario FOREIGN KEY (UsuarioID) REFERENCES DIM_USUARIOS(ID) ON DELETE CASCADE,
        CONSTRAINT UQ_Suscripcion UNIQUE (ReporteID, UsuarioID)
    );
    PRINT 'Tabla DIM_REPORTE_SUSCRIPCIONES creada';
END
GO

-- 3. Control de acceso por perfil
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DIM_REPORTE_ACCESO')
BEGIN
    CREATE TABLE DIM_REPORTE_ACCESO (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        ReporteID INT NOT NULL,
        PerfilID INT NOT NULL,
        
        FechaAsignacion DATETIME DEFAULT GETDATE(),
        AsignadoPor NVARCHAR(200) NULL,
        
        CONSTRAINT FK_Acceso_Reporte FOREIGN KEY (ReporteID) REFERENCES DIM_REPORTES(ID) ON DELETE CASCADE,
        CONSTRAINT FK_Acceso_Perfil FOREIGN KEY (PerfilID) REFERENCES DIM_PERFILES(ID) ON DELETE CASCADE,
        CONSTRAINT UQ_Acceso UNIQUE (ReporteID, PerfilID)
    );
    PRINT 'Tabla DIM_REPORTE_ACCESO creada';
END
GO

-- Índices
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Suscripciones_Usuario')
    CREATE INDEX IX_Suscripciones_Usuario ON DIM_REPORTE_SUSCRIPCIONES(UsuarioID);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Suscripciones_Reporte')
    CREATE INDEX IX_Suscripciones_Reporte ON DIM_REPORTE_SUSCRIPCIONES(ReporteID);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Acceso_Perfil')
    CREATE INDEX IX_Acceso_Perfil ON DIM_REPORTE_ACCESO(PerfilID);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Acceso_Reporte')
    CREATE INDEX IX_Acceso_Reporte ON DIM_REPORTE_ACCESO(ReporteID);
GO

-- Agregar columna de permiso de reportes a DIM_USUARIOS si no existe
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_USUARIOS') AND name = 'AccesoReportes')
BEGIN
    ALTER TABLE DIM_USUARIOS ADD AccesoReportes BIT DEFAULT 0;
    PRINT 'Columna AccesoReportes agregada a DIM_USUARIOS';
END
GO

-- Agregar columna de permiso de reportes a DIM_PERFILES si no existe
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('DIM_PERFILES') AND name = 'AccesoReportes')
BEGIN
    ALTER TABLE DIM_PERFILES ADD AccesoReportes BIT DEFAULT 0;
    PRINT 'Columna AccesoReportes agregada a DIM_PERFILES';
END
GO

PRINT '✅ Migración de Reportes completada';
