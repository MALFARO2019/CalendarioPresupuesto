// ==========================================
// INOCUIDAD (Evaluación de Inocuidad en Restaurantes) ENDPOINTS
// ==========================================

module.exports = function registerInocuidadEndpoints(app, authMiddleware) {

    const { getFormsPool, sql: fSql } = require('./formsDb');
    const { poolPromise, sql } = require('./db');

    // ─── Helper: ensure FormsFieldConfig table exists ───────────────────────────
    async function ensureFieldConfigTable() {
        const pool = await getFormsPool();
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FormsFieldConfig')
            BEGIN
                CREATE TABLE FormsFieldConfig (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    SourceID INT NOT NULL,
                    ColumnName NVARCHAR(255) NOT NULL,
                    ShortName NVARCHAR(100) NULL,
                    VisibleEnCalor BIT NOT NULL DEFAULT 1,
                    Orden INT NOT NULL DEFAULT 0,
                    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT UQ_FormsFieldConfig UNIQUE (SourceID, ColumnName)
                );
            END
        `);
    }

    // Run on startup
    ensureFieldConfigTable().catch(e => console.warn('⚠️ FormsFieldConfig init:', e.message));

    // ─── Helper: get all sources marked for inocuidad or all forms sources ──────
    async function getFormsSources() {
        const pool = await getFormsPool();
        const result = await pool.request().query(`
            SELECT SourceID, Alias, TableName, UltimaSync, TotalRespuestas, Activo
            FROM FormsSources
            WHERE Activo = 1
            ORDER BY Alias
        `);
        return result.recordset;
    }

    // ─── Helper: get field config for a source ──────────────────────────────────
    async function getFieldConfig(sourceId) {
        const pool = await getFormsPool();
        const result = await pool.request()
            .input('sourceId', fSql.Int, sourceId)
            .query('SELECT * FROM FormsFieldConfig WHERE SourceID = @sourceId ORDER BY Orden, ColumnName');
        return result.recordset;
    }

    // ─── Helper: resolve codalmacen → local name ────────────────────────────────
    async function getLocalNames() {
        const mainPool = await poolPromise;
        const result = await mainPool.request().query(`
            SELECT DISTINCT
                RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS AS CODALMACEN,
                COALESCE(
                    n.NOMBRE_OPERACIONES,
                    n.NOMBRE_CONTA,
                    n.NOMBRE_INOCUIDAD,
                    n.NOMBRE_JUSTO,
                    d.NOMBREALMACEN COLLATE Modern_Spanish_CI_AS,
                    RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
                ) AS NOMBRE
            FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
            INNER JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA ON GL.IDGRUPO = GA.IDGRUPO
            LEFT JOIN DIM_NOMBRES_ALMACEN n ON RTRIM(n.CODALMACEN) = RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
            LEFT JOIN DIM_ALMACEN d ON RTRIM(d.CODALMACEN) COLLATE Modern_Spanish_CI_AS = RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS
            WHERE GA.CODVISIBLE = 20
        `);
        const map = {};
        for (const row of result.recordset) {
            map[row.CODALMACEN] = row.NOMBRE;
        }
        return map;
    }

    // ─── Helper: get KPI config for color thresholds ────────────────────────────
    async function getKpiConfig(kpiName) {
        const mainPool = await poolPromise;
        try {
            const result = await mainPool.request()
                .input('nombre', sql.NVarChar, kpiName)
                .query(`
                    SELECT * FROM kpi_configuraciones
                    WHERE Nombre = @nombre AND Activo = 1
                `);
            return result.recordset[0] || null;
        } catch (e) {
            return null;
        }
    }

    // ─── Helper: get stores for a group ─────────────────────────────────────────
    async function getGroupStores(groupName) {
        const mainPool = await poolPromise;
        try {
            const result = await mainPool.request()
                .input('grupo', sql.NVarChar, groupName)
                .query(`
                    SELECT RTRIM(GL.CODALMACEN) COLLATE Modern_Spanish_CI_AS AS CODALMACEN
                    FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
                    INNER JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA ON GL.IDGRUPO = GA.IDGRUPO
                    WHERE GA.CODVISIBLE = 20 AND GA.GRUPO = @grupo
                `);
            return result.recordset.map(r => r.CODALMACEN);
        } catch (e) {
            return [];
        }
    }

    // ─── Helper: get personal asignado for a local ──────────────────────────────
    async function getPersonalAsignado(codAlmacen) {
        const mainPool = await poolPromise;
        try {
            const result = await mainPool.request()
                .input('cod', sql.NVarChar, codAlmacen)
                .query(`
                    SELECT u.Nombre, p.Nombre AS Perfil
                    FROM PERSONAL_ASIGNADO pa
                    INNER JOIN APP_USUARIOS u ON pa.UsuarioID = u.Id
                    INNER JOIN APP_PERFILES p ON pa.PerfilID = p.Id
                    WHERE pa.CodAlmacen = @cod AND pa.Activo = 1
                    ORDER BY p.Nombre, u.Nombre
                `);
            return result.recordset.map(r => ({ nombre: r.Nombre, perfil: r.Perfil }));
        } catch (e) {
            return [];
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /api/inocuidad/sources — list all forms sources
    // ═══════════════════════════════════════════════════════════════════════════
    app.get('/api/inocuidad/sources', authMiddleware, async (req, res) => {
        try {
            console.log('🔍 [Inocuidad] Fetching sources...');
            const sources = await getFormsSources();
            console.log(`✅ [Inocuidad] Found ${sources.length} source(s):`, sources.map(s => `${s.SourceID}:${s.Alias}`));
            res.json(sources);
        } catch (err) {
            console.error('❌ [Inocuidad] Sources error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /api/inocuidad/available-years/:sourceId — available years with data
    // ═══════════════════════════════════════════════════════════════════════════
    app.get('/api/inocuidad/available-years/:sourceId', authMiddleware, async (req, res) => {
        try {
            const sourceId = parseInt(req.params.sourceId);
            const pool = await getFormsPool();
            const src = await pool.request()
                .input('id', fSql.Int, sourceId)
                .query('SELECT TableName FROM FormsSources WHERE SourceID = @id');
            if (src.recordset.length === 0) return res.json([]);
            const tableName = src.recordset[0].TableName;
            if (!tableName) return res.json([]);

            const tblCheck = await pool.request()
                .input('tbl', fSql.NVarChar, tableName)
                .query('SELECT 1 FROM sys.tables WHERE name = @tbl');
            if (tblCheck.recordset.length === 0) return res.json([]);

            const result = await pool.request().query(
                `SELECT DISTINCT YEAR(SubmittedAt) AS yr FROM [${tableName}] WHERE _CODALMACEN IS NOT NULL ORDER BY yr DESC`
            );
            res.json(result.recordset.map(r => r.yr));
        } catch (err) {
            console.error('❌ available-years error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /api/inocuidad/config/:sourceId — get field config for a source
    // ═══════════════════════════════════════════════════════════════════════════
    app.get('/api/inocuidad/config/:sourceId', authMiddleware, async (req, res) => {
        try {
            const sourceId = parseInt(req.params.sourceId);
            const config = await getFieldConfig(sourceId);

            // Also get the columns from the actual table
            const pool = await getFormsPool();
            const src = await pool.request()
                .input('id', fSql.Int, sourceId)
                .query('SELECT TableName FROM FormsSources WHERE SourceID = @id');

            let columns = [];
            if (src.recordset[0]?.TableName) {
                const tableName = src.recordset[0].TableName;
                const colResult = await pool.request()
                    .input('tbl', fSql.NVarChar, tableName)
                    .query(`
                        SELECT COLUMN_NAME, DATA_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_NAME = @tbl
                        AND COLUMN_NAME NOT IN ('ID', 'ResponseID', 'RespondentEmail', 'RespondentName', 'SubmittedAt', 'SyncedAt', '_CODALMACEN', '_PERSONAL_ID', '_PERSONAL_NOMBRE')
                        ORDER BY ORDINAL_POSITION
                    `);
                columns = colResult.recordset;
            }

            res.json({ config, columns });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // POST /api/inocuidad/config/:sourceId — save field config (bulk)
    // ═══════════════════════════════════════════════════════════════════════════
    app.post('/api/inocuidad/config/:sourceId', authMiddleware, async (req, res) => {
        try {
            const sourceId = parseInt(req.params.sourceId);
            const { fields } = req.body; // Array of { columnName, shortName, visibleEnCalor, orden }

            if (!Array.isArray(fields)) {
                return res.status(400).json({ error: 'fields must be an array' });
            }

            const pool = await getFormsPool();

            for (const field of fields) {
                await pool.request()
                    .input('sourceId', fSql.Int, sourceId)
                    .input('columnName', fSql.NVarChar, field.columnName)
                    .input('shortName', fSql.NVarChar, field.shortName || null)
                    .input('visible', fSql.Bit, field.visibleEnCalor !== false ? 1 : 0)
                    .input('orden', fSql.Int, field.orden || 0)
                    .query(`
                        MERGE FormsFieldConfig AS target
                        USING (SELECT @sourceId AS SourceID, @columnName AS ColumnName) AS source
                        ON target.SourceID = source.SourceID AND target.ColumnName = source.ColumnName
                        WHEN MATCHED THEN
                            UPDATE SET ShortName = @shortName, VisibleEnCalor = @visible, Orden = @orden, UpdatedAt = GETDATE()
                        WHEN NOT MATCHED THEN
                            INSERT (SourceID, ColumnName, ShortName, VisibleEnCalor, Orden)
                            VALUES (@sourceId, @columnName, @shortName, @visible, @orden);
                    `);
            }

            res.json({ ok: true, message: `${fields.length} fields saved` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /api/inocuidad/tendencia — trend view data
    // Params: sourceId, year, locales (comma-sep), grupoId
    // ═══════════════════════════════════════════════════════════════════════════
    app.get('/api/inocuidad/tendencia', authMiddleware, async (req, res) => {
        try {
            const { sourceId, year, locales, grupo } = req.query;
            if (!sourceId) return res.status(400).json({ error: 'sourceId required' });

            const pool = await getFormsPool();
            const src = await pool.request()
                .input('id', fSql.Int, parseInt(sourceId))
                .query('SELECT TableName, Alias FROM FormsSources WHERE SourceID = @id');

            if (src.recordset.length === 0) return res.status(404).json({ error: 'Source not found' });
            const tableName = src.recordset[0].TableName;
            if (!tableName) return res.status(400).json({ error: 'Table not created yet. Run a sync first.' });

            // Check table exists
            const tblCheck = await pool.request()
                .input('tbl', fSql.NVarChar, tableName)
                .query('SELECT 1 FROM sys.tables WHERE name = @tbl');
            if (tblCheck.recordset.length === 0) {
                return res.json({ rows: [], months: [], localNames: {} });
            }

            // Determine which locales to filter
            let filterCodes = [];
            if (locales) {
                filterCodes = locales.split(',').map(s => s.trim()).filter(Boolean);
            } else if (grupo) {
                filterCodes = await getGroupStores(grupo);
            }

            // Detect score column: prefer Total_de_puntos, fallback to first Puntos_* int column
            const numCols = await pool.request()
                .input('tbl', fSql.NVarChar, tableName)
                .query(`
                    SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = @tbl
                    AND DATA_TYPE IN ('int', 'decimal', 'float', 'numeric')
                    AND COLUMN_NAME NOT IN ('ID', '_PERSONAL_ID', 'Q_Id')
                    ORDER BY ORDINAL_POSITION
                `);
            const allNumeric = numCols.recordset.map(r => r.COLUMN_NAME);
            const scoreColumn = allNumeric.includes('Total_de_puntos')
                ? 'Total_de_puntos'
                : allNumeric.find(c => c.startsWith('Puntos_')) || allNumeric[0] || null;

            // Build query — group by month and _CODALMACEN, using the score column
            const yearInt = parseInt(year) || new Date().getFullYear();
            let whereClause = `WHERE YEAR(SubmittedAt) = @year AND _CODALMACEN IS NOT NULL`;

            if (filterCodes.length > 0) {
                whereClause += ` AND _CODALMACEN IN (${filterCodes.map((_, i) => `@loc${i}`).join(',')})`;
            }

            const queryStr = `
                SELECT 
                    _CODALMACEN AS codAlmacen,
                    MONTH(SubmittedAt) AS mes,
                    COUNT(*) AS evaluaciones,
                    ${scoreColumn ? `AVG(CAST([${scoreColumn}] AS FLOAT))` : '0'} AS promedioGeneral
                FROM [${tableName}]
                ${whereClause}
                GROUP BY _CODALMACEN, MONTH(SubmittedAt)
                ORDER BY _CODALMACEN, MONTH(SubmittedAt)
            `;

            const request = pool.request().input('year', fSql.Int, yearInt);
            filterCodes.forEach((code, i) => {
                request.input(`loc${i}`, fSql.NVarChar, code);
            });

            const result = await request.query(queryStr);

            // Get local names
            const localNames = await getLocalNames();

            // Get personal asignado for single local
            let personalAsignado = [];
            if (filterCodes.length === 1) {
                personalAsignado = await getPersonalAsignado(filterCodes[0]);
            }

            // Build response: rows by local, with month columns
            const groupedByLocal = {};
            for (const row of result.recordset) {
                const cod = row.codAlmacen;
                if (!groupedByLocal[cod]) {
                    groupedByLocal[cod] = {
                        codAlmacen: cod,
                        local: localNames[cod] || cod,
                        months: {}
                    };
                }
                groupedByLocal[cod].months[row.mes] = {
                    promedio: row.promedioGeneral,
                    evaluaciones: row.evaluaciones
                };
            }

            // Get KPI config for color thresholds
            const kpiConfig = await getKpiConfig('Inocuidad');

            // Get available years for this source
            const yearsResult = await pool.request()
                .input('tblYears', fSql.NVarChar, tableName)
                .query(`SELECT DISTINCT YEAR(SubmittedAt) AS yr FROM [${tableName}] WHERE _CODALMACEN IS NOT NULL ORDER BY yr DESC`);
            const availableYears = yearsResult.recordset.map(r => r.yr);

            res.json({
                rows: Object.values(groupedByLocal),
                scoreColumn,
                kpiConfig,
                personalAsignado,
                localNames,
                year: yearInt,
                availableYears
            });
        } catch (err) {
            console.error('❌ inocuidad/tendencia error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /api/inocuidad/calor — heat map view data
    // Params: sourceId, year, rangoTipo, rangoValor, locales, grupo
    // Returns individual evaluation rows (one row per evaluation)
    // ═══════════════════════════════════════════════════════════════════════════
    app.get('/api/inocuidad/calor', authMiddleware, async (req, res) => {
        try {
            const { sourceId, year, rangoTipo, rangoValor, locales, grupo } = req.query;
            if (!sourceId) return res.status(400).json({ error: 'sourceId required' });

            const pool = await getFormsPool();
            const src = await pool.request()
                .input('id', fSql.Int, parseInt(sourceId))
                .query('SELECT TableName FROM FormsSources WHERE SourceID = @id');

            if (src.recordset.length === 0) return res.status(404).json({ error: 'Source not found' });
            const tableName = src.recordset[0].TableName;
            if (!tableName) return res.json({ rows: [], criterios: [] });

            // Get field config for short names + visibility
            const fieldConfig = await getFieldConfig(parseInt(sourceId));
            const configMap = {};
            for (const fc of fieldConfig) {
                configMap[fc.ColumnName] = fc;
            }

            // Get Puntos_* and Points_* columns for heatmap criteria
            const allCols = await pool.request()
                .input('tbl', fSql.NVarChar, tableName)
                .query(`
                    SELECT COLUMN_NAME, DATA_TYPE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = @tbl
                    AND COLUMN_NAME NOT IN (
                        'ID', 'ResponseID', 'RespondentEmail', 'RespondentName',
                        'SubmittedAt', 'SyncedAt', '_CODALMACEN', '_PERSONAL_ID', '_PERSONAL_NOMBRE',
                        'Q_Id', 'Total_de_puntos', 'Hora_de_inicio', 'Hora_de_finalizacion',
                        'Correo_electronico', 'Nombre', 'Comentarios_del_cuestionario',
                        'Hora_de_publicacion_de_la_calificacion', 'Restaurante',
                        'Puntos_Restaurante', 'Comentarios_Restaurante',
                        'Fecha_de_la_evaluacion', 'Puntos_Fecha_de_la_evaluacion', 'Comentarios_Fecha_de_la_evaluacion',
                        'Nombre_del_administrativo_a_cargo_del_turno', 'Puntos_Nombre_del_administrativo_a_cargo_del_turno', 'Comentarios_Nombre_del_administrativo_a_cargo_del_turno',
                        'Nombre_del_evaluador', 'Puntos_Nombre_del_evaluador', 'Comentarios_Nombre_del_evaluador',
                        'COMENTARIOS_ADICIONALES', 'Puntos_COMENTARIOS_ADICIONALES', 'Comentarios_COMENTARIOS_ADICIONALES'
                    )
                    ORDER BY ORDINAL_POSITION
                `);

            const hasConfig = fieldConfig.length > 0;

            // Filter to criteria columns — only Puntos_*/Points_* with int type
            // Also exclude Comentarios_* columns (text feedback, not scores)
            const criterios = allCols.recordset
                .filter(col => {
                    const name = col.COLUMN_NAME;
                    // Skip all Comentarios_ and Feedback_ columns
                    if (name.startsWith('Comentarios_') || name.startsWith('Feedback_')) return false;

                    const cfg = configMap[name];
                    if (hasConfig) {
                        return cfg && cfg.VisibleEnCalor;
                    }
                    // Auto-detect: Puntos_* and Points_* int columns (the numeric scores)
                    return (name.startsWith('Puntos_') || name.startsWith('Points_'))
                        && (col.DATA_TYPE === 'int' || col.DATA_TYPE === 'nvarchar');
                })
                .map(col => {
                    const cfg = configMap[col.COLUMN_NAME];
                    let shortName = cfg?.ShortName || col.COLUMN_NAME;
                    if (!cfg?.ShortName) {
                        shortName = shortName
                            .replace(/^Puntos_/, '')
                            .replace(/^Points_/, '')
                            .replace(/_/g, ' ')
                            .substring(0, 50);
                    }
                    return {
                        columnName: col.COLUMN_NAME,
                        shortName,
                        dataType: col.DATA_TYPE,
                        orden: cfg?.Orden || 0
                    };
                })
                .sort((a, b) => a.orden - b.orden);

            // Determine locales filter
            let filterCodes = [];
            if (locales) {
                filterCodes = locales.split(',').map(s => s.trim()).filter(Boolean);
            } else if (grupo) {
                filterCodes = await getGroupStores(grupo);
            }

            // Build date filter
            const yearInt = parseInt(year) || new Date().getFullYear();
            let dateFilter = `YEAR(SubmittedAt) = @year`;

            if (rangoTipo === 'Mes' && rangoValor) {
                dateFilter += ` AND MONTH(SubmittedAt) = @rangoValor`;
            } else if (rangoTipo === 'Trimestre' && rangoValor) {
                const q = parseInt(rangoValor);
                const startMonth = (q - 1) * 3 + 1;
                const endMonth = startMonth + 2;
                dateFilter += ` AND MONTH(SubmittedAt) BETWEEN @startMonth AND @endMonth`;
            } else if (rangoTipo === 'Semestre' && rangoValor) {
                const s = parseInt(rangoValor);
                const startMonth = s === 1 ? 1 : 7;
                const endMonth = s === 1 ? 6 : 12;
                dateFilter += ` AND MONTH(SubmittedAt) BETWEEN @startMonth AND @endMonth`;
            }

            let whereClause = `WHERE ${dateFilter} AND _CODALMACEN IS NOT NULL`;
            if (filterCodes.length > 0) {
                whereClause += ` AND _CODALMACEN IN (${filterCodes.map((_, i) => `@loc${i}`).join(',')})`;
            }

            // Build SELECT — include identity columns + all criteria
            const selectCols = criterios.map(c => `[${c.columnName}]`).join(', ');

            // Check which display columns exist in the table
            const displayColCheck = await pool.request()
                .input('tbl', fSql.NVarChar, tableName)
                .query(`
                    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = @tbl AND COLUMN_NAME IN ('Restaurante', 'Nombre_del_evaluador', 'Nombre_del_administrativo_a_cargo_del_turno', 'Total_de_puntos')
                `);
            const existingDisplayCols = displayColCheck.recordset.map(r => r.COLUMN_NAME);

            let displaySelect = '_CODALMACEN AS codAlmacen, SubmittedAt';
            if (existingDisplayCols.includes('Restaurante')) displaySelect += ', [Restaurante]';
            if (existingDisplayCols.includes('Nombre_del_evaluador')) displaySelect += ', [Nombre_del_evaluador] AS evaluador';
            if (existingDisplayCols.includes('Nombre_del_administrativo_a_cargo_del_turno')) displaySelect += ', [Nombre_del_administrativo_a_cargo_del_turno] AS adminTurno';
            if (existingDisplayCols.includes('Total_de_puntos')) displaySelect += ', [Total_de_puntos] AS totalPuntos';

            const queryStr = `
                SELECT ${displaySelect}${selectCols ? ', ' + selectCols : ''}
                FROM [${tableName}]
                ${whereClause}
                ORDER BY SubmittedAt DESC, _CODALMACEN
            `;

            const request = pool.request().input('year', fSql.Int, yearInt);
            if (rangoTipo === 'Mes' && rangoValor) {
                request.input('rangoValor', fSql.Int, parseInt(rangoValor));
            } else if ((rangoTipo === 'Trimestre' || rangoTipo === 'Semestre') && rangoValor) {
                const val = parseInt(rangoValor);
                if (rangoTipo === 'Trimestre') {
                    request.input('startMonth', fSql.Int, (val - 1) * 3 + 1);
                    request.input('endMonth', fSql.Int, (val - 1) * 3 + 3);
                } else {
                    request.input('startMonth', fSql.Int, val === 1 ? 1 : 7);
                    request.input('endMonth', fSql.Int, val === 1 ? 6 : 12);
                }
            }
            filterCodes.forEach((code, i) => {
                request.input(`loc${i}`, fSql.NVarChar, code);
            });

            const result = await request.query(queryStr);

            // Get local names for display
            const localNames = await getLocalNames();

            // Build individual rows
            const rows = result.recordset.map(row => {
                const values = {};
                for (const crit of criterios) {
                    values[crit.columnName] = row[crit.columnName];
                }
                return {
                    codAlmacen: row.codAlmacen,
                    local: localNames[row.codAlmacen] || row.Restaurante || row.codAlmacen,
                    restaurante: row.Restaurante || null,
                    evaluador: row.evaluador || null,
                    adminTurno: row.adminTurno || null,
                    totalPuntos: row.totalPuntos || null,
                    submittedAt: row.SubmittedAt,
                    values
                };
            });

            // Get KPI config
            const kpiConfig = await getKpiConfig('Inocuidad');

            res.json({
                rows,
                criterios,
                kpiConfig,
                totalRecords: rows.length
            });
        } catch (err) {
            console.error('❌ inocuidad/calor error:', err);
            res.status(500).json({ error: err.message });
        }
    });

}; // end registerInocuidadEndpoints
