const { sql, poolPromise } = require('./db');

// ==========================================
// MODELO PRESUPUESTO — Data Access Module
// ==========================================

// ------------------------------------------
// CONFIG
// ------------------------------------------

/**
 * Get the first active budget model configuration
 */
async function getConfig() {
    const pool = await poolPromise;
    const result = await pool.request()
        .query(`
            SELECT Id as id, NombrePresupuesto as nombrePresupuesto, AnoModelo as anoModelo,
                   TablaDestino as tablaDestino, HoraCalculo as horaCalculo,
                   UltimoCalculo as ultimoCalculo, UltimoUsuario as ultimoUsuario,
                   Activo as activo, FechaCreacion as fechaCreacion, FechaModificacion as fechaModificacion
            FROM MODELO_PRESUPUESTO_CONFIG
            WHERE Activo = 1
            ORDER BY Id DESC
        `);
    return result.recordset[0] || null;
}

/**
 * Get ALL configurations (active and inactive)
 */
async function getAllConfigs() {
    const pool = await poolPromise;
    const result = await pool.request()
        .query(`
            SELECT Id as id, NombrePresupuesto as nombrePresupuesto, AnoModelo as anoModelo,
                   TablaDestino as tablaDestino, HoraCalculo as horaCalculo,
                   UltimoCalculo as ultimoCalculo, UltimoUsuario as ultimoUsuario,
                   Activo as activo, ISNULL(EjecutarEnJob, 0) as ejecutarEnJob,
                   FechaCreacion as fechaCreacion, FechaModificacion as fechaModificacion
            FROM MODELO_PRESUPUESTO_CONFIG
            ORDER BY Activo DESC, AnoModelo DESC, Id DESC
        `);
    return result.recordset;
}

/**
 * Save (upsert) budget model configuration
 * Prevents duplicates by NombrePresupuesto (case-insensitive)
 */
async function saveConfig(id, data) {
    const pool = await poolPromise;

    // Check for duplicate name (different id)
    const dupCheck = await pool.request()
        .input('nombre', sql.NVarChar(100), data.nombrePresupuesto)
        .input('excludeId', sql.Int, id || 0)
        .query(`
            SELECT Id FROM MODELO_PRESUPUESTO_CONFIG
            WHERE LOWER(NombrePresupuesto) = LOWER(@nombre)
              AND Id != @excludeId
        `);
    if (dupCheck.recordset.length > 0) {
        throw new Error(`Ya existe una configuración con el nombre "${data.nombrePresupuesto}"`);
    }

    if (id) {
        // Update existing
        await pool.request()
            .input('id', sql.Int, id)
            .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
            .input('anoModelo', sql.Int, data.anoModelo)
            .input('tablaDestino', sql.NVarChar(100), data.tablaDestino)
            .input('horaCalculo', sql.NVarChar(5), data.horaCalculo)
            .input('ejecutarEnJob', sql.Bit, data.ejecutarEnJob ? 1 : 0)
            .query(`
                UPDATE MODELO_PRESUPUESTO_CONFIG
                SET NombrePresupuesto = @nombrePresupuesto,
                    AnoModelo = @anoModelo,
                    TablaDestino = @tablaDestino,
                    HoraCalculo = @horaCalculo,
                    EjecutarEnJob = @ejecutarEnJob,
                    FechaModificacion = GETDATE()
                WHERE Id = @id
            `);
        return id;
    } else {
        // Insert new config
        const result = await pool.request()
            .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
            .input('anoModelo', sql.Int, data.anoModelo)
            .input('tablaDestino', sql.NVarChar(100), data.tablaDestino)
            .input('horaCalculo', sql.NVarChar(5), data.horaCalculo)
            .input('ejecutarEnJob', sql.Bit, data.ejecutarEnJob ? 1 : 0)
            .query(`
                INSERT INTO MODELO_PRESUPUESTO_CONFIG
                    (NombrePresupuesto, AnoModelo, TablaDestino, HoraCalculo, Activo, EjecutarEnJob)
                OUTPUT INSERTED.Id
                VALUES (@nombrePresupuesto, @anoModelo, @tablaDestino, @horaCalculo, 1, @ejecutarEnJob)
            `);
        return result.recordset[0].Id;
    }
}

/**
 * Delete (soft) a configuration by id
 */
async function deleteConfig(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query(`DELETE FROM MODELO_PRESUPUESTO_CONFIG WHERE Id = @id`);
}

// ------------------------------------------
// CÁLCULO
// ------------------------------------------

/**
 * Execute the budget calculation stored procedure
 * @param {string} usuario - User who triggered the calculation
 * @param {string|null} codAlmacen - Optional store filter
 * @param {number|null} mes - Optional month filter
 */
async function ejecutarCalculo(usuario, codAlmacen = null, mes = null, nombrePresupuesto = null) {
    const pool = await poolPromise;
    const request = pool.request()
        .input('Usuario', sql.NVarChar(200), usuario);

    if (nombrePresupuesto) request.input('NombrePresupuesto', sql.NVarChar(100), nombrePresupuesto);
    if (codAlmacen) request.input('CodAlmacen', sql.NVarChar(10), codAlmacen);
    if (mes) request.input('Mes', sql.Int, mes);

    // Execute the stored procedure
    const result = await request.execute('SP_CALCULAR_PRESUPUESTO');

    // The SP already updates the config, but ensure it's done
    if (nombrePresupuesto) {
        await pool.request()
            .input('usuario', sql.NVarChar(200), usuario)
            .input('nombre', sql.NVarChar(100), nombrePresupuesto)
            .query(`
                UPDATE MODELO_PRESUPUESTO_CONFIG
                SET UltimoCalculo = GETDATE(),
                    UltimoUsuario = @usuario,
                    FechaModificacion = GETDATE()
                WHERE NombrePresupuesto = @nombre
            `);
    }

    return result;
}

// ------------------------------------------
// CONSOLIDADO MENSUAL
// ------------------------------------------

/**
 * Get consolidado mensual data (KpisRosti_Consolidado_Mensual)
 */
async function getConsolidadoMensual(ano, codAlmacen = null, tipo = null) {
    const pool = await poolPromise;
    let query = `
        SELECT 
            ANO as ano, MES as mes, TIPO as tipo,
            RESTAURANTE as local, CODALMACEN as codAlmacen,
            SALON as salon, LLEVAR as llevar, AUTO as auto,
            EXPRESS as express, ECOMMERCE as ecommerce,
            UBEREATS as ubereats, TOTAL as total
        FROM KpisRosti_Consolidado_Mensual
        WHERE ANO = @ano
    `;
    const request = pool.request().input('ano', sql.Int, ano);

    if (codAlmacen) {
        query += ' AND CODALMACEN = @codAlmacen';
        request.input('codAlmacen', sql.NVarChar(10), codAlmacen);
    }
    if (tipo) {
        query += ' AND TIPO = @tipo';
        request.input('tipo', sql.NVarChar(100), tipo);
    }

    query += ' ORDER BY CODALMACEN, MES';
    const result = await request.query(query);
    return result.recordset;
}

/**
 * Initialize consolidado data for a new year by copying stores from previous year
 * Creates empty rows (all zeros) for each store × month × tipo combination
 */
async function initializeYear(ano) {
    const pool = await poolPromise;

    // Check if year already has data
    const existing = await pool.request()
        .input('ano', sql.Int, ano)
        .query(`SELECT COUNT(*) as cnt FROM KpisRosti_Consolidado_Mensual WHERE ANO = @ano`);
    if (existing.recordset[0].cnt > 0) {
        throw new Error(`El año ${ano} ya tiene ${existing.recordset[0].cnt} registros. Use el grid para editarlos.`);
    }

    // Get stores from previous year
    const prevYear = await pool.request()
        .input('ano', sql.Int, ano - 1)
        .query(`SELECT DISTINCT CODALMACEN, RESTAURANTE FROM KpisRosti_Consolidado_Mensual WHERE ANO = @ano`);

    if (prevYear.recordset.length === 0) {
        throw new Error(`No se encontraron locales en el año ${ano - 1} para copiar la estructura.`);
    }

    const tipos = ['VENTA', 'TRANSACCIONES', 'TQP'];
    let inserted = 0;

    const transaction = pool.transaction();
    await transaction.begin();
    try {
        for (const store of prevYear.recordset) {
            for (const tipo of tipos) {
                for (let mes = 1; mes <= 12; mes++) {
                    await transaction.request()
                        .input('ano', sql.Int, ano)
                        .input('mes', sql.Int, mes)
                        .input('tipo', sql.NVarChar(100), tipo)
                        .input('restaurante', sql.NVarChar(200), store.RESTAURANTE)
                        .input('codAlmacen', sql.NVarChar(10), store.CODALMACEN)
                        .query(`
                            INSERT INTO KpisRosti_Consolidado_Mensual
                                (ANO, MES, TIPO, RESTAURANTE, CODALMACEN, SALON, LLEVAR, AUTO, EXPRESS, ECOMMERCE, UBEREATS, TOTAL)
                            VALUES (@ano, @mes, @tipo, @restaurante, @codAlmacen, 0, 0, 0, 0, 0, 0, 0)
                        `);
                    inserted++;
                }
            }
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }

    return { success: true, inserted, stores: prevYear.recordset.length, tipos: tipos.length };
}

async function saveConsolidadoMensual(rows, usuario) {
    const pool = await poolPromise;
    const transaction = pool.transaction();

    try {
        await transaction.begin();

        for (const row of rows) {
            await transaction.request()
                .input('ano', sql.Int, row.ano)
                .input('mes', sql.Int, row.mes)
                .input('tipo', sql.NVarChar(100), row.tipo)
                .input('codAlmacen', sql.NVarChar(10), row.codAlmacen)
                .input('salon', sql.Decimal(18, 4), row.salon || 0)
                .input('llevar', sql.Decimal(18, 4), row.llevar || 0)
                .input('auto', sql.Decimal(18, 4), row.auto || 0)
                .input('express', sql.Decimal(18, 4), row.express || 0)
                .input('ecommerce', sql.Decimal(18, 4), row.ecommerce || 0)
                .input('ubereats', sql.Decimal(18, 4), row.ubereats || 0)
                .input('total', sql.Decimal(18, 4), row.total || 0)
                .query(`
                    UPDATE KpisRosti_Consolidado_Mensual
                    SET SALON = @salon, LLEVAR = @llevar, AUTO = @auto,
                        EXPRESS = @express, ECOMMERCE = @ecommerce, UBEREATS = @ubereats,
                        TOTAL = @total
                    WHERE ANO = @ano AND MES = @mes AND TIPO = @tipo AND CODALMACEN = @codAlmacen
                `);
        }

        // Log to bitacora
        await transaction.request()
            .input('usuario', sql.NVarChar(200), usuario)
            .input('accion', sql.NVarChar(100), 'EditConsolidado')
            .input('detalle', sql.NVarChar(sql.MAX), JSON.stringify({ rowsUpdated: rows.length }))
            .query(`
                INSERT INTO MODELO_PRESUPUESTO_BITACORA
                    (NombrePresupuesto, Usuario, Accion, Origen, Detalle)
                SELECT TOP 1 NombrePresupuesto, @usuario, @accion, 'Manual', @detalle
                FROM MODELO_PRESUPUESTO_CONFIG WHERE Activo = 1
            `);

        await transaction.commit();
        return { success: true, rowsUpdated: rows.length };
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}

// ------------------------------------------
// AJUSTES
// ------------------------------------------

/**
 * Get active adjustments for a budget model
 */
async function getAjustes(nombrePresupuesto) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto)
        .query(`
            SELECT Id, NombrePresupuesto, CodAlmacen, Mes, Dia, Canal, Tipo,
                   MetodoAjuste, ValorAjuste, MetodoDistribucion, Motivo,
                   FechaAplicacion, Usuario, Activo
            FROM MODELO_PRESUPUESTO_AJUSTES
            WHERE NombrePresupuesto = @nombrePresupuesto
            ORDER BY FechaAplicacion DESC
        `);
    return result.recordset;
}

/**
 * Apply an adjustment via stored procedure
 */
async function aplicarAjuste(data) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
        .input('codAlmacen', sql.NVarChar(10), data.codAlmacen)
        .input('mes', sql.Int, data.mes)
        .input('dia', sql.Int, data.dia || null)
        .input('canal', sql.NVarChar(200), data.canal)
        .input('tipo', sql.NVarChar(100), data.tipo)
        .input('metodoAjuste', sql.NVarChar(50), data.metodoAjuste)
        .input('valorAjuste', sql.Decimal(18, 4), data.valorAjuste)
        .input('metodoDistribucion', sql.NVarChar(50), data.metodoDistribucion || 'Mes')
        .input('usuario', sql.NVarChar(200), data.usuario)
        .input('motivo', sql.NVarChar(500), data.motivo || '')
        .execute('SP_AJUSTAR_PRESUPUESTO');

    return result;
}

/**
 * Preview an adjustment without saving (returns calculated impact)
 */
async function previewAjuste(data) {
    const pool = await poolPromise;

    // Get current daily values for the store/month/channel
    const config = await getConfig();
    if (!config) throw new Error('No hay configuración activa');

    const tablaDestino = config.TablaDestino;
    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
        .input('codAlmacen', sql.NVarChar(10), data.codAlmacen)
        .input('mes', sql.Int, data.mes)
        .input('canal', sql.NVarChar(200), data.canal)
        .input('tipo', sql.NVarChar(100), data.tipo)
        .query(`
            SELECT Fecha, Dia, Presupuesto, Real_Valor, AnoAnterior, AnoAnteriorAjustado
            FROM ${tablaDestino}
            WHERE NombrePresupuesto = @nombrePresupuesto
              AND CodAlmacen = @codAlmacen
              AND MONTH(Fecha) = @mes
              AND Canal = @canal
              AND Tipo = @tipo
            ORDER BY Dia
        `);

    const dailyData = result.recordset;
    const totalActual = dailyData.reduce((sum, r) => sum + (r.Presupuesto || 0), 0);

    // Calculate adjusted values based on method
    let adjustedData;
    const valor = parseFloat(data.valorAjuste);

    switch (data.metodoAjuste) {
        case 'Porcentaje':
            adjustedData = dailyData.map(d => ({
                ...d,
                PresupuestoAjustado: d.Presupuesto * (1 + valor / 100),
                Diferencia: d.Presupuesto * (valor / 100)
            }));
            break;
        case 'MontoAbsoluto':
            // Distribute the absolute amount proportionally
            adjustedData = dailyData.map(d => {
                const proporcion = totalActual > 0 ? (d.Presupuesto / totalActual) : (1 / dailyData.length);
                const diff = valor * proporcion;
                return {
                    ...d,
                    PresupuestoAjustado: d.Presupuesto + diff,
                    Diferencia: diff
                };
            });
            break;
        case 'Factor':
            adjustedData = dailyData.map(d => ({
                ...d,
                PresupuestoAjustado: d.Presupuesto * valor,
                Diferencia: d.Presupuesto * (valor - 1)
            }));
            break;
        default:
            throw new Error(`Método de ajuste no válido: ${data.metodoAjuste}`);
    }

    const totalAjustado = adjustedData.reduce((sum, r) => sum + r.PresupuestoAjustado, 0);

    return {
        dailyData: adjustedData,
        totalActual,
        totalAjustado,
        diferenciaNeta: totalAjustado - totalActual,
        porcentajeCambio: totalActual > 0 ? ((totalAjustado - totalActual) / totalActual * 100) : 0
    };
}

/**
 * Deactivate an adjustment
 */
async function desactivarAjuste(id, usuario) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('usuario', sql.NVarChar(200), usuario)
        .query(`
            UPDATE MODELO_PRESUPUESTO_AJUSTES
            SET Activo = 0
            WHERE Id = @id
        `);

    // Log to bitacora
    await pool.request()
        .input('usuario', sql.NVarChar(200), usuario)
        .input('ajusteId', sql.Int, id)
        .query(`
            INSERT INTO MODELO_PRESUPUESTO_BITACORA
                (NombrePresupuesto, Usuario, Accion, Origen, Detalle)
            SELECT TOP 1 NombrePresupuesto, @usuario, 'DesactivarAjuste', 'Manual',
                   '{"ajusteId": ' + CAST(@ajusteId AS NVARCHAR) + '}'
            FROM MODELO_PRESUPUESTO_CONFIG WHERE Activo = 1
        `);
}

// ------------------------------------------
// VERSIONES
// ------------------------------------------

/**
 * Get all versions for a budget model
 */
async function getVersiones(nombrePresupuesto) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto)
        .query(`
            SELECT Id, NombrePresupuesto, NumeroVersion, NombreTabla,
                   FechaCreacion, Usuario, Origen, TotalRegistros, Notas
            FROM MODELO_PRESUPUESTO_VERSIONES
            WHERE NombrePresupuesto = @nombrePresupuesto
            ORDER BY NumeroVersion DESC
        `);
    return result.recordset;
}

/**
 * Restore a version (via stored procedure)
 */
async function restaurarVersion(versionId, usuario) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('versionId', sql.Int, versionId)
        .input('usuario', sql.NVarChar(200), usuario)
        .input('modo', sql.NVarChar(20), 'Restore')
        .execute('SP_VERSION_PRESUPUESTO');
    return result;
}

// ------------------------------------------
// BITÁCORA
// ------------------------------------------

/**
 * Get bitacora (audit log) entries with optional filters
 */
async function getBitacora(filtros = {}) {
    const pool = await poolPromise;
    let query = `
        SELECT TOP 500 Id, NombrePresupuesto, Usuario, FechaHora, Accion,
               CodAlmacen, Local, Mes, Canal, Tipo,
               ValorAnterior, ValorNuevo, Motivo, Origen, Detalle
        FROM MODELO_PRESUPUESTO_BITACORA
        WHERE 1=1
    `;
    const request = pool.request();

    if (filtros.nombrePresupuesto) {
        query += ' AND NombrePresupuesto = @nombrePresupuesto';
        request.input('nombrePresupuesto', sql.NVarChar(100), filtros.nombrePresupuesto);
    }
    if (filtros.usuario) {
        query += ' AND Usuario = @usuario';
        request.input('usuario', sql.NVarChar(200), filtros.usuario);
    }
    if (filtros.mes) {
        query += ' AND Mes = @mes';
        request.input('mes', sql.Int, filtros.mes);
    }
    if (filtros.codAlmacen) {
        query += ' AND CodAlmacen = @codAlmacen';
        request.input('codAlmacen', sql.NVarChar(10), filtros.codAlmacen);
    }
    if (filtros.accion) {
        query += ' AND Accion = @accion';
        request.input('accion', sql.NVarChar(100), filtros.accion);
    }
    if (filtros.desde) {
        query += ' AND FechaHora >= @desde';
        request.input('desde', sql.DateTime, new Date(filtros.desde));
    }
    if (filtros.hasta) {
        query += ' AND FechaHora <= @hasta';
        request.input('hasta', sql.DateTime, new Date(filtros.hasta));
    }

    query += ' ORDER BY FechaHora DESC';
    const result = await request.query(query);
    return result.recordset;
}

// ------------------------------------------
// REFERENCIAS (MAPEO DE LOCALES)
// ------------------------------------------

/**
 * Get all store reference mappings
 * @param {string} nombrePresupuesto
 * @param {number|null} ano - Optional year filter
 */
async function getReferencias(nombrePresupuesto, ano = null) {
    const pool = await poolPromise;
    const req = pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto);
    let whereClause = 'WHERE NombrePresupuesto = @nombrePresupuesto AND Activo = 1';
    if (ano) {
        req.input('ano', sql.Int, ano);
        whereClause += ' AND Ano = @ano';
    }
    const result = await req.query(`
            SELECT Id as id, CodAlmacenNuevo as codAlmacenNuevo, NombreAlmacenNuevo as nombreAlmacenNuevo,
                   CodAlmacenReferencia as codAlmacenReferencia, NombreAlmacenReferencia as nombreAlmacenReferencia,
                   Canal as canal, Ano as ano, NombrePresupuesto as nombrePresupuesto,
                   FechaCreacion as fechaCreacion, Usuario as usuario, Activo as activo
            FROM DIM_MAPEO_PRESUPUESTO_LOCALES
            ${whereClause}
            ORDER BY Ano DESC, CodAlmacenNuevo
        `);
    return result.recordset;
}

/**
 * Create or update a store reference mapping
 */
async function saveReferencia(data) {
    const pool = await poolPromise;

    if (data.id) {
        // Update existing
        await pool.request()
            .input('id', sql.Int, data.id)
            .input('codAlmacenNuevo', sql.NVarChar(10), data.codAlmacenNuevo)
            .input('nombreAlmacenNuevo', sql.NVarChar(255), data.nombreAlmacenNuevo || '')
            .input('codAlmacenReferencia', sql.NVarChar(10), data.codAlmacenReferencia)
            .input('nombreAlmacenReferencia', sql.NVarChar(255), data.nombreAlmacenReferencia || '')
            .input('canal', sql.NVarChar(200), data.canal || null)
            .input('ano', sql.Int, data.ano || new Date().getFullYear())
            .input('usuario', sql.NVarChar(200), data.usuario || '')
            .query(`
                UPDATE DIM_MAPEO_PRESUPUESTO_LOCALES
                SET CodAlmacenNuevo = @codAlmacenNuevo,
                    NombreAlmacenNuevo = @nombreAlmacenNuevo,
                    CodAlmacenReferencia = @codAlmacenReferencia,
                    NombreAlmacenReferencia = @nombreAlmacenReferencia,
                    Canal = @canal,
                    Ano = @ano,
                    Usuario = @usuario
                WHERE Id = @id
            `);
        return data.id;
    } else {
        // Create new
        const result = await pool.request()
            .input('codAlmacenNuevo', sql.NVarChar(10), data.codAlmacenNuevo)
            .input('nombreAlmacenNuevo', sql.NVarChar(255), data.nombreAlmacenNuevo || '')
            .input('codAlmacenReferencia', sql.NVarChar(10), data.codAlmacenReferencia)
            .input('nombreAlmacenReferencia', sql.NVarChar(255), data.nombreAlmacenReferencia || '')
            .input('canal', sql.NVarChar(200), data.canal || null)
            .input('ano', sql.Int, data.ano || new Date().getFullYear())
            .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
            .input('usuario', sql.NVarChar(200), data.usuario || '')
            .query(`
                INSERT INTO DIM_MAPEO_PRESUPUESTO_LOCALES
                    (CodAlmacenNuevo, NombreAlmacenNuevo, CodAlmacenReferencia,
                     NombreAlmacenReferencia, Canal, Ano, NombrePresupuesto, Usuario)
                OUTPUT INSERTED.Id
                VALUES (@codAlmacenNuevo, @nombreAlmacenNuevo, @codAlmacenReferencia,
                        @nombreAlmacenReferencia, @canal, @ano, @nombrePresupuesto, @usuario)
            `);
        return result.recordset[0].Id;
    }
}

/**
 * Delete (soft-delete) a store reference mapping
 */
async function deleteReferencia(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query(`
            UPDATE DIM_MAPEO_PRESUPUESTO_LOCALES
            SET Activo = 0
            WHERE Id = @id
        `);
}

// ------------------------------------------
// VALIDACIÓN
// ------------------------------------------

/**
 * Validate budget integrity: compare daily sums vs monthly consolidado
 */
async function getValidacion(nombrePresupuesto) {
    const pool = await poolPromise;
    // Get config for this specific presupuesto
    const configResult = await pool.request()
        .input('nombre', sql.NVarChar(100), nombrePresupuesto)
        .query(`SELECT TOP 1 AnoModelo, TablaDestino FROM MODELO_PRESUPUESTO_CONFIG WHERE NombrePresupuesto = @nombre`);
    if (configResult.recordset.length === 0) return [];
    const cfg = configResult.recordset[0];

    // Channel mapping: RSM table uses Salón, AutoPollo, etc; Consolidado uses SALON, AUTO, etc
    const channelMap = {
        'Salón': 'SALON', 'Llevar': 'LLEVAR', 'AutoPollo': 'AUTO',
        'Express': 'EXPRESS', 'ECommerce': 'ECOMMERCE', 'UberEats': 'UBEREATS'
    };

    const results = [];
    for (const [canalRsm, colConsolidado] of Object.entries(channelMap)) {
        try {
            const res = await pool.request()
                .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto)
                .input('canal', sql.NVarChar(200), canalRsm)
                .input('ano', sql.Int, cfg.AnoModelo)
                .query(`
                    SELECT
                        d.CodAlmacen as codAlmacen,
                        d.Canal as canal,
                        d.Tipo as tipo,
                        d.Mes as mes,
                        SUM(d.Monto) AS sumaDiaria,
                        MAX(c.${colConsolidado}) AS valorConsolidado
                    FROM [${cfg.TablaDestino}] d
                    LEFT JOIN KpisRosti_Consolidado_Mensual c
                        ON d.CodAlmacen = c.CodAlmacen
                        AND d.Tipo = c.Tipo
                        AND d.Mes = c.Mes
                        AND c.Ano = @ano
                    WHERE d.NombrePresupuesto = @nombrePresupuesto
                      AND d.Canal = @canal
                      AND d.Tipo IN ('Ventas', 'Transacciones')
                      AND LEFT(d.CodAlmacen, 1) != 'G'
                    GROUP BY d.CodAlmacen, d.Canal, d.Tipo, d.Mes
                    HAVING ABS(SUM(d.Monto) - ISNULL(MAX(c.${colConsolidado}), 0)) > 1
                    ORDER BY d.CodAlmacen, d.Mes
                `);
            for (const r of res.recordset) {
                results.push({
                    codAlmacen: r.codAlmacen, canal: r.canal, tipo: r.tipo, mes: r.mes,
                    local: r.codAlmacen,
                    esperado: r.valorConsolidado || 0, real: r.sumaDiaria || 0,
                    diferencia: (r.sumaDiaria || 0) - (r.valorConsolidado || 0),
                    match: false
                });
            }
        } catch (e) {
            // If table doesn't exist yet, return empty
            if (e.message.includes('Invalid object')) return [];
            throw e;
        }
    }
    return results;
}

/**
 * Get daily budget data for the adjustment chart
 */
async function getDatosAjuste(nombrePresupuesto, codAlmacen, mes, canal, tipo) {
    const pool = await poolPromise;
    const config = await getConfig();
    if (!config) throw new Error('No hay configuración activa');

    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto)
        .input('codAlmacen', sql.NVarChar(10), codAlmacen)
        .input('mes', sql.Int, mes)
        .input('canal', sql.NVarChar(200), canal)
        .input('tipo', sql.NVarChar(100), tipo)
        .query(`
            SELECT Fecha, Dia, DiaSemana,
                   Presupuesto, Real_Valor AS RealValor,
                   AnoAnterior, AnoAnteriorAjustado,
                   PresupuestoAcum, Real_Acum AS RealAcum,
                   AnoAnteriorAcum, AnoAnteriorAjustadoAcum,
                   DiferenciaPresupuesto, DiferenciaAnoAnterior
            FROM ${config.TablaDestino}
            WHERE NombrePresupuesto = @nombrePresupuesto
              AND CodAlmacen = @codAlmacen
              AND MONTH(Fecha) = @mes
              AND Canal = @canal
              AND Tipo = @tipo
            ORDER BY Dia
        `);

    return result.recordset;
}

// ------------------------------------------
// STORES (for dropdowns)
// ------------------------------------------

/**
 * Get all store codes with their names (for dropdowns)
 */
async function getStoresWithNames() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT DISTINCT 
            c.CodAlmacen as code,
            COALESCE(n.NOMBRE_OPERACIONES, n.NOMBRE_GENERAL, n.NOMBRE_CONTA, c.CodAlmacen) as name
        FROM KpisRosti_Consolidado_Mensual c
        LEFT JOIN DIM_NOMBRES_ALMACEN n ON RTRIM(n.CODALMACEN) = c.CodAlmacen
        ORDER BY c.CodAlmacen
    `);
    return result.recordset;
}

module.exports = {
    // Config
    getConfig,
    getAllConfigs,
    saveConfig,
    deleteConfig,
    ejecutarCalculo,
    // Consolidado
    getConsolidadoMensual,
    saveConsolidadoMensual,
    initializeYear,
    // Ajustes
    getAjustes,
    aplicarAjuste,
    previewAjuste,
    desactivarAjuste,
    getDatosAjuste,
    // Versiones
    getVersiones,
    restaurarVersion,
    // Bitácora
    getBitacora,
    // Referencias
    getReferencias,
    saveReferencia,
    deleteReferencia,
    // Validación
    getValidacion,
    // Stores
    getStoresWithNames
};
