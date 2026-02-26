const fs = require('fs');
const content = fs.readFileSync('sp_def_current.sql', 'utf16le');
fs.writeFileSync('sp_def_current_utf8.sql', content, 'utf8');
console.log('Conversion finished');
