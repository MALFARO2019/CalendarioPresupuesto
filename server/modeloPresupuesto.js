const { sql, poolPromise } = require('./db');

// ==========================================
// MODELO PRESUPUESTO — Data Access Module
// ==========================================

// ------------------------------------------
// CONFIG
// ------------------------------------------

/**
 * Get the active budget model configuration
 */
async function getConfig() {
    const pool = await poolPromise;
    const result = await pool.request()
        .query(`
            SELECT Id, NombrePresupuesto, AnoModelo, TablaDestino, HoraCalculo,
                   UltimoCalculo, UltimoUsuario, Activo, FechaCreacion, FechaModificacion
            FROM MODELO_PRESUPUESTO_CONFIG
            WHERE Activo = 1
            ORDER BY Id DESC
        `);
    return result.recordset[0] || null;
}

/**
 * Save (update) budget model configuration
 */
async function saveConfig(id, data) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
        .input('anoModelo', sql.Int, data.anoModelo)
        .input('tablaDestino', sql.NVarChar(100), data.tablaDestino)
        .input('horaCalculo', sql.NVarChar(5), data.horaCalculo)
        .query(`
            UPDATE MODELO_PRESUPUESTO_CONFIG
            SET NombrePresupuesto = @nombrePresupuesto,
                AnoModelo = @anoModelo,
                TablaDestino = @tablaDestino,
                HoraCalculo = @horaCalculo,
                FechaModificacion = GETDATE()
            WHERE Id = @id
        `);
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
async function ejecutarCalculo(usuario, codAlmacen = null, mes = null) {
    const pool = await poolPromise;
    const request = pool.request()
        .input('usuario', sql.NVarChar(200), usuario);

    if (codAlmacen) request.input('codAlmacen', sql.NVarChar(10), codAlmacen);
    if (mes) request.input('mes', sql.Int, mes);

    // Execute the stored procedure
    const result = await request.execute('SP_CALCULAR_PRESUPUESTO');

    // Update config with last calculation info
    await pool.request()
        .input('usuario', sql.NVarChar(200), usuario)
        .query(`
            UPDATE MODELO_PRESUPUESTO_CONFIG
            SET UltimoCalculo = GETDATE(),
                UltimoUsuario = @usuario,
                FechaModificacion = GETDATE()
            WHERE Activo = 1
        `);

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
        SELECT *
        FROM KpisRosti_Consolidado_Mensual
        WHERE Ano = @ano
    `;
    const request = pool.request().input('ano', sql.Int, ano);

    if (codAlmacen) {
        query += ' AND CodAlmacen = @codAlmacen';
        request.input('codAlmacen', sql.NVarChar(10), codAlmacen);
    }
    if (tipo) {
        query += ' AND Tipo = @tipo';
        request.input('tipo', sql.NVarChar(100), tipo);
    }

    query += ' ORDER BY CodAlmacen, Canal, Mes';
    const result = await request.query(query);
    return result.recordset;
}

/**
 * Save consolidado mensual rows (batch update)
 */
async function saveConsolidadoMensual(rows, usuario) {
    const pool = await poolPromise;
    const transaction = pool.transaction();

    try {
        await transaction.begin();

        for (const row of rows) {
            await transaction.request()
                .input('id', sql.Int, row.Id)
                .input('valor', sql.Decimal(18, 4), row.Valor)
                .query(`
                    UPDATE KpisRosti_Consolidado_Mensual
                    SET Valor = @valor
                    WHERE Id = @id
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
 */
async function getReferencias(nombrePresupuesto) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto)
        .query(`
            SELECT Id, CodAlmacenNuevo, NombreAlmacenNuevo,
                   CodAlmacenReferencia, NombreAlmacenReferencia,
                   Canal, NombrePresupuesto, FechaCreacion, Usuario, Activo
            FROM DIM_MAPEO_PRESUPUESTO_LOCALES
            WHERE NombrePresupuesto = @nombrePresupuesto
              AND Activo = 1
            ORDER BY CodAlmacenNuevo
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
            .input('usuario', sql.NVarChar(200), data.usuario || '')
            .query(`
                UPDATE DIM_MAPEO_PRESUPUESTO_LOCALES
                SET CodAlmacenNuevo = @codAlmacenNuevo,
                    NombreAlmacenNuevo = @nombreAlmacenNuevo,
                    CodAlmacenReferencia = @codAlmacenReferencia,
                    NombreAlmacenReferencia = @nombreAlmacenReferencia,
                    Canal = @canal,
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
            .input('nombrePresupuesto', sql.NVarChar(100), data.nombrePresupuesto)
            .input('usuario', sql.NVarChar(200), data.usuario || '')
            .query(`
                INSERT INTO DIM_MAPEO_PRESUPUESTO_LOCALES
                    (CodAlmacenNuevo, NombreAlmacenNuevo, CodAlmacenReferencia,
                     NombreAlmacenReferencia, Canal, NombrePresupuesto, Usuario)
                OUTPUT INSERTED.Id
                VALUES (@codAlmacenNuevo, @nombreAlmacenNuevo, @codAlmacenReferencia,
                        @nombreAlmacenReferencia, @canal, @nombrePresupuesto, @usuario)
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
    const config = await getConfig();
    if (!config) return [];

    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), nombrePresupuesto)
        .input('ano', sql.Int, config.AnoModelo)
        .query(`
            SELECT 
                d.CodAlmacen,
                d.Canal,
                d.Tipo,
                MONTH(d.Fecha) AS Mes,
                SUM(d.Presupuesto) AS SumaDiaria,
                c.Valor AS ValorConsolidado,
                SUM(d.Presupuesto) - c.Valor AS Diferencia
            FROM ${config.TablaDestino} d
            LEFT JOIN KpisRosti_Consolidado_Mensual c
                ON d.CodAlmacen = c.CodAlmacen
                AND d.Canal = c.Canal
                AND d.Tipo = c.Tipo
                AND MONTH(d.Fecha) = c.Mes
                AND c.Ano = @ano
            WHERE d.NombrePresupuesto = @nombrePresupuesto
            GROUP BY d.CodAlmacen, d.Canal, d.Tipo, MONTH(d.Fecha), c.Valor
            HAVING ABS(SUM(d.Presupuesto) - ISNULL(c.Valor, 0)) > 1
            ORDER BY d.CodAlmacen, MONTH(d.Fecha), d.Canal, d.Tipo
        `);

    return result.recordset;
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

module.exports = {
    // Config
    getConfig,
    saveConfig,
    ejecutarCalculo,
    // Consolidado
    getConsolidadoMensual,
    saveConsolidadoMensual,
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
    getValidacion
};
