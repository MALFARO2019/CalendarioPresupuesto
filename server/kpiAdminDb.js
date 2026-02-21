/**
 * kpiAdminDb.js
 * Base de datos del sistema de Administración de KPIs y Grupos.
 * Crea las tablas necesarias al inicio y expone el pool de conexión.
 */
const { poolPromise, sql } = require('./db');

async function ensureKpiAdminTables() {
    const pool = await poolPromise;

    // 1. Módulos (Presupuesto, Tiempos, Evaluaciones, etc.)
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'kpi_modulos')
        CREATE TABLE kpi_modulos (
            id          INT IDENTITY(1,1) PRIMARY KEY,
            nombre      NVARCHAR(100) NOT NULL,
            descripcion NVARCHAR(500) NULL,
            icono       NVARCHAR(50)  NULL DEFAULT '📊',
            activo      BIT           NOT NULL DEFAULT 1,
            created_at  DATETIME      NOT NULL DEFAULT GETDATE()
        )
    `);

    // 2. Definiciones de KPI (catálogo maestro con query SQL)
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'kpi_definitions')
        CREATE TABLE kpi_definitions (
            id          INT IDENTITY(1,1) PRIMARY KEY,
            modulo_id   INT           NOT NULL REFERENCES kpi_modulos(id),
            nombre      NVARCHAR(100) NOT NULL,
            descripcion NVARCHAR(500) NULL,
            sql_query   NVARCHAR(MAX) NULL,
            unidad      NVARCHAR(20)  NOT NULL DEFAULT '%',
            tipo_vista  NVARCHAR(20)  NOT NULL DEFAULT 'ambas',
            activo      BIT           NOT NULL DEFAULT 1,
            created_at  DATETIME      NOT NULL DEFAULT GETDATE()
        )
    `);

    // 3. Grupos de KPI (Grupo Gerencial, Grupo Operacional, etc.)
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'kpi_grupos')
        CREATE TABLE kpi_grupos (
            id          INT IDENTITY(1,1) PRIMARY KEY,
            modulo_id   INT           NOT NULL REFERENCES kpi_modulos(id),
            nombre      NVARCHAR(100) NOT NULL,
            descripcion NVARCHAR(500) NULL,
            activo      BIT           NOT NULL DEFAULT 1,
            created_at  DATETIME      NOT NULL DEFAULT GETDATE()
        )
    `);

    // 4. KPIs dentro de un grupo con sus pesos
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'kpi_grupo_kpis')
        CREATE TABLE kpi_grupo_kpis (
            id        INT IDENTITY(1,1) PRIMARY KEY,
            grupo_id  INT             NOT NULL REFERENCES kpi_grupos(id) ON DELETE CASCADE,
            kpi_id    INT             NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
            peso      DECIMAL(5,2)    NOT NULL DEFAULT 0,
            orden     INT             NOT NULL DEFAULT 0,
            CONSTRAINT uq_grupo_kpi UNIQUE (grupo_id, kpi_id)
        )
    `);

    // 5. Configuración de metas y colores por KPI + Local/Grupo
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'kpi_configuraciones')
        CREATE TABLE kpi_configuraciones (
            id              INT IDENTITY(1,1) PRIMARY KEY,
            kpi_id          INT             NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
            local_grupo     NVARCHAR(100)   NOT NULL DEFAULT 'Todos',
            meta_default    DECIMAL(15,4)   NULL,
            meta_enero      DECIMAL(15,4)   NULL,
            meta_febrero    DECIMAL(15,4)   NULL,
            meta_marzo      DECIMAL(15,4)   NULL,
            meta_abril      DECIMAL(15,4)   NULL,
            meta_mayo       DECIMAL(15,4)   NULL,
            meta_junio      DECIMAL(15,4)   NULL,
            meta_julio      DECIMAL(15,4)   NULL,
            meta_agosto     DECIMAL(15,4)   NULL,
            meta_setiembre  DECIMAL(15,4)   NULL,
            meta_octubre    DECIMAL(15,4)   NULL,
            meta_noviembre  DECIMAL(15,4)   NULL,
            meta_diciembre  DECIMAL(15,4)   NULL,
            umbral_rojo     DECIMAL(5,2)    NOT NULL DEFAULT 75,
            umbral_amarillo DECIMAL(5,2)    NOT NULL DEFAULT 90,
            CONSTRAINT uq_kpi_local UNIQUE (kpi_id, local_grupo)
        )
    `);

    // 6. Asignaciones de gerentes a grupos por local
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'kpi_grupo_asignaciones')
        CREATE TABLE kpi_grupo_asignaciones (
            id          INT IDENTITY(1,1) PRIMARY KEY,
            grupo_id    INT           NOT NULL REFERENCES kpi_grupos(id) ON DELETE CASCADE,
            local_grupo NVARCHAR(100) NOT NULL,
            gerente     NVARCHAR(100) NULL,
            activo      BIT           NOT NULL DEFAULT 1,
            CONSTRAINT uq_grupo_asignacion UNIQUE (grupo_id, local_grupo)
        )
    `);

    // Insertar módulo Presupuesto por defecto si no existe
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM kpi_modulos WHERE nombre = 'Presupuesto')
        INSERT INTO kpi_modulos (nombre, descripcion, icono) 
        VALUES ('Presupuesto', 'KPIs de alcance y cumplimiento presupuestal', '💰')
    `);

    console.log('✅ KPI Admin tables ready');
}

module.exports = { ensureKpiAdminTables, poolPromise, sql };
