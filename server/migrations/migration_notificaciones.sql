-- =============================================
-- MIGRACIÓN: Módulo de Notificaciones
-- CalendarioPresupuesto
-- =============================================

-- 1. Catálogo de clasificaciones
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_Clasificaciones_Notif' AND xtype='U')
CREATE TABLE APP_Clasificaciones_Notif (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    Nombre      NVARCHAR(100) NOT NULL,
    Color       NVARCHAR(20)  NOT NULL DEFAULT '#6366F1',  -- HEX color
    Activo      BIT NOT NULL DEFAULT 1,
    Orden       INT NOT NULL DEFAULT 0
);

-- Seed clasificaciones
IF NOT EXISTS (SELECT 1 FROM APP_Clasificaciones_Notif WHERE Nombre = 'Operaciones')
INSERT INTO APP_Clasificaciones_Notif (Nombre, Color, Orden) VALUES
    ('Operaciones',      '#F59E0B', 1),
    ('Mercadeo',         '#EC4899', 2),
    ('Tecnología',       '#6366F1', 3),
    ('Finanzas',         '#10B981', 4),
    ('Gestión Humana',   '#8B5CF6', 5);
GO

-- 2. Notificaciones administrativas
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_Notificaciones' AND xtype='U')
CREATE TABLE APP_Notificaciones (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    Titulo                  NVARCHAR(200) NOT NULL,
    Texto                   NVARCHAR(MAX) NOT NULL,
    ImagenUrl               NVARCHAR(500) NULL,
    ClasificacionId         INT NOT NULL REFERENCES APP_Clasificaciones_Notif(Id),
    NRepeticiones           INT NOT NULL DEFAULT 1,  -- cuántas veces debe aparecer
    RequiereComentario      NVARCHAR(20) NOT NULL DEFAULT 'none',  -- 'none','opcional','obligatorio'
    RequiereCodigoEmpleado  BIT NOT NULL DEFAULT 0,
    ComunicarConFlamia      BIT NOT NULL DEFAULT 0,
    Activo                  BIT NOT NULL DEFAULT 1,
    FechaCreacion           DATETIME NOT NULL DEFAULT GETDATE(),
    CreadoPor               NVARCHAR(200) NULL,
    FechaModificacion       DATETIME NULL,
    ModificadoPor           NVARCHAR(200) NULL
);
GO

-- 3. Notificaciones de versión (ligadas a publicaciones)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_Notif_Versiones' AND xtype='U')
CREATE TABLE APP_Notif_Versiones (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    VersionId       NVARCHAR(50) NOT NULL,       -- e.g. "v1.3", "v2.0"
    Orden           INT NOT NULL DEFAULT 0,
    Titulo          NVARCHAR(200) NOT NULL,
    Texto           NVARCHAR(MAX) NOT NULL,
    Tipo            NVARCHAR(50) NOT NULL DEFAULT 'mejora',  -- 'mejora','corrección','nuevo','info'
    Activo          BIT NOT NULL DEFAULT 1,
    FechaPublicacion DATETIME NULL,
    FechaCreacion   DATETIME NOT NULL DEFAULT GETDATE(),
    CreadoPor       NVARCHAR(200) NULL
);
GO

-- Index para consultas por versión
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_APP_Notif_Versiones_VersionId')
    CREATE INDEX IX_APP_Notif_Versiones_VersionId ON APP_Notif_Versiones(VersionId);
GO

-- 4. Log de revisión de notificaciones
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_Notif_Log' AND xtype='U')
CREATE TABLE APP_Notif_Log (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioId       INT NOT NULL,
    NotifId         INT NULL,            -- FK a APP_Notificaciones (si tipo='admin')
    NotifVersionId  INT NULL,            -- FK a APP_Notif_Versiones (si tipo='version')
    Tipo            NVARCHAR(20) NOT NULL DEFAULT 'admin',  -- 'admin' | 'version'
    NumRepeticion   INT NOT NULL DEFAULT 1,
    FechaVista      DATETIME NOT NULL DEFAULT GETDATE(),
    Comentario      NVARCHAR(MAX) NULL,
    CodigoEmpleado  NVARCHAR(50) NULL,
    IP              NVARCHAR(50) NULL
);
GO

-- Índices para reportes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_APP_Notif_Log_Usuario')
    CREATE INDEX IX_APP_Notif_Log_Usuario ON APP_Notif_Log(UsuarioId, FechaVista);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_APP_Notif_Log_NotifId')
    CREATE INDEX IX_APP_Notif_Log_NotifId ON APP_Notif_Log(NotifId);
GO

-- 5. Nuevas columnas en APP_USUARIOS para permisos de notificaciones
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('APP_USUARIOS') AND name='accesoNotificaciones')
    ALTER TABLE APP_USUARIOS ADD accesoNotificaciones BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('APP_USUARIOS') AND name='crearNotificaciones')
    ALTER TABLE APP_USUARIOS ADD crearNotificaciones BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('APP_USUARIOS') AND name='notifClasificaciones')
    ALTER TABLE APP_USUARIOS ADD notifClasificaciones NVARCHAR(500) NULL;
GO

-- 6. Nuevas columnas en perfiles (si existe la tabla de perfiles)
IF EXISTS (SELECT * FROM sysobjects WHERE name='APP_Perfiles' AND xtype='U')
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('APP_Perfiles') AND name='accesoNotificaciones')
        ALTER TABLE APP_Perfiles ADD accesoNotificaciones BIT NOT NULL DEFAULT 0;
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('APP_Perfiles') AND name='crearNotificaciones')
        ALTER TABLE APP_Perfiles ADD crearNotificaciones BIT NOT NULL DEFAULT 0;
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('APP_Perfiles') AND name='notifClasificaciones')
        ALTER TABLE APP_Perfiles ADD notifClasificaciones NVARCHAR(500) NULL;
END
GO

PRINT '✅ Migración de Notificaciones aplicada correctamente';
