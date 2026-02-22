const { poolPromise, sql } = require('./db');

async function test() {
    const pool = await poolPromise;

    // Test the EXACT query the backend does
    const config = await pool.request().query(
        'SELECT TOP 1 Id, NombrePresupuesto, TablaDestino FROM MODELO_PRESUPUESTO_CONFIG WHERE Activo = 1 ORDER BY Id DESC'
    );
    const c = config.recordset[0];
    console.log('Active config:', JSON.stringify(c));
    console.log('NombrePresupuesto hex:', Buffer.from(c.NombrePresupuesto).toString('hex'));

    // Test exact match query
    const result = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), c.NombrePresupuesto)
        .query('SELECT Mes as mes, SUM(Monto) as total FROM [' + c.TablaDestino + '] WHERE NombrePresupuesto = @nombrePresupuesto GROUP BY Mes ORDER BY Mes');

    console.log('Monthly agg result:', JSON.stringify(result.recordset));
    console.log('Rows:', result.recordset.length);

    // Also test with codAlmacen filter
    const withStore = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), c.NombrePresupuesto)
        .input('codAlmacen', sql.NVarChar(10), 'S01')
        .query('SELECT Mes as mes, SUM(Monto) as total FROM [' + c.TablaDestino + '] WHERE NombrePresupuesto = @nombrePresupuesto AND CodAlmacen = @codAlmacen GROUP BY Mes ORDER BY Mes');

    console.log('With CodAlmacen S01:', JSON.stringify(withStore.recordset));

    // Also test with tipo
    const withTipo = await pool.request()
        .input('nombrePresupuesto', sql.NVarChar(100), c.NombrePresupuesto)
        .input('codAlmacen', sql.NVarChar(10), 'S01')
        .input('tipo', sql.NVarChar(100), 'Ventas')
        .query('SELECT Mes as mes, SUM(Monto) as total FROM [' + c.TablaDestino + '] WHERE NombrePresupuesto = @nombrePresupuesto AND CodAlmacen = @codAlmacen AND Tipo = @tipo GROUP BY Mes ORDER BY Mes');

    console.log('With CodAlmacen S01 + Tipo Ventas:', JSON.stringify(withTipo.recordset));

    // Table columns
    const cols = await pool.request().query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '" + c.TablaDestino + "' AND COLUMN_NAME LIKE '%Tipo%' ORDER BY COLUMN_NAME"
    );
    console.log('Tipo-like columns:', JSON.stringify(cols.recordset));

    // Distinct tipo values
    const tipos = await pool.request().query(
        'SELECT DISTINCT Tipo FROM [' + c.TablaDestino + ']'
    );
    console.log('Distinct Tipo values:', JSON.stringify(tipos.recordset));

    // Distinct codAlmacen
    const stores = await pool.request().query(
        'SELECT DISTINCT CodAlmacen FROM [' + c.TablaDestino + '] ORDER BY CodAlmacen'
    );
    console.log('Distinct CodAlmacen (first 10):', JSON.stringify(stores.recordset.slice(0, 10)));

    process.exit(0);
}

test().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
