const XLSX = require('./server/node_modules/xlsx');
const fs = require('fs');
const wb = XLSX.readFile('Tendencia KPI Ventas 2026 V6.xlsx');
let out = 'Sheets: ' + JSON.stringify(wb.SheetNames) + '\n';

wb.SheetNames.forEach(s => {
    const ws = wb.Sheets[s];
    const ref = ws['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    out += `\n=== ${s} === rows: ${range.e.r + 1}, cols: ${range.e.c + 1}\n`;
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    data.slice(0, 35).forEach((row, i) => {
        const vals = row.slice(0, 20).map(v => v === '' ? '' : String(v).substring(0, 30));
        out += `R${i + 1}: ${vals.join(' | ')}\n`;
    });
});
fs.writeFileSync('excel_output.txt', out);
console.log('Done');
