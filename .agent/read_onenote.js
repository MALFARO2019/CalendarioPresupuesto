/**
 * Script para leer páginas de OneNote via Microsoft Graph API
 * Para cuentas personales de Microsoft (Live/Hotmail/Outlook)
 * 
 * Uso: node read_onenote.js --list-pages
 *      node read_onenote.js --search "Pendiente"
 *      node read_onenote.js --page <page-id>
 *      node read_onenote.js --auth   (primera vez: obtener refresh token)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TENANT_ID = '70df046e-e545-44c7-ae8c-21c53272ee6e';
const CLIENT_ID = '44490c35-76d8-451c-a10f-05c526df8e38';
const CLIENT_SECRET = 'q2l8Q~F6ul3dMZHQUmmF5FCPa5eIHzEWOU5pIaZI';
const REDIRECT_URI = 'http://localhost';
const TOKEN_FILE = path.join(__dirname, '.onenote_token.json');

function httpsPost(hostname, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
        const options = {
            hostname, path, method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(bodyStr),
                ...headers
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

function httpsGet(hostname, urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = { hostname, path: urlPath, method: 'GET', headers };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
        });
        req.on('error', reject);
        req.end();
    });
}

function httpsGetRaw(hostname, urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = { hostname, path: urlPath, method: 'GET', headers };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.end();
    });
}

async function refreshAccessToken(refreshToken) {
    const result = await httpsPost('login.microsoftonline.com', `/${TENANT_ID}/oauth2/v2.0/token`, {
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        scope: 'Notes.Read Notes.Read.All offline_access'
    });
    if (result.access_token) {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(result, null, 2));
        return result.access_token;
    }
    throw new Error(result.error_description || JSON.stringify(result));
}

async function getToken() {
    if (!fs.existsSync(TOKEN_FILE)) {
        throw new Error('No hay token guardado. Ejecuta: node read_onenote.js --auth');
    }
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    // Refresh the token
    return await refreshAccessToken(saved.refresh_token);
}

function htmlToText(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function main() {
    const args = process.argv.slice(2);

    if (args[0] === '--auth') {
        // Step 1: Show auth URL
        const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?` +
            `client_id=${CLIENT_ID}&response_type=code&` +
            `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
            `scope=${encodeURIComponent('Notes.Read Notes.Read.All offline_access')}&` +
            `response_mode=query`;

        console.log('🔐 Abre este URL en tu navegador:\n');
        console.log(authUrl);
        console.log('\nDespués de autorizar, copia el "code" de la URL de redirección y ejecuta:');
        console.log('node read_onenote.js --token <code>');
        return;
    }

    if (args[0] === '--token') {
        const code = args[1];
        if (!code) { console.error('Falta el código. Usa: node read_onenote.js --token <code>'); return; }

        console.log('🔑 Intercambiando código por token...');
        const result = await httpsPost('login.microsoftonline.com', `/${TENANT_ID}/oauth2/v2.0/token`, {
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code,
            redirect_uri: REDIRECT_URI,
            scope: 'Notes.Read Notes.Read.All offline_access'
        });

        if (result.access_token) {
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(result, null, 2));
            console.log('✅ Token guardado en .onenote_token.json');
            console.log('Ya puedes usar: node read_onenote.js --list-pages');
        } else {
            console.error('❌ Error:', result.error_description || JSON.stringify(result));
        }
        return;
    }

    try {
        console.log('🔑 Obteniendo token...');
        const token = await getToken();
        console.log('✅ Autenticado\n');
        const authHeader = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

        if (args[0] === '--list-pages' || args[0] === '--search') {
            const searchTerm = args[0] === '--search' ? args[1] : null;
            const result = await httpsGet('graph.microsoft.com',
                '/v1.0/me/onenote/pages?$top=100&$select=id,title,parentSection,lastModifiedDateTime&$orderby=lastModifiedDateTime%20desc',
                authHeader);

            if (result.error) { console.error('❌ Error:', result.error.message); return; }

            const pages = result.value || [];
            const filtered = searchTerm
                ? pages.filter(p => p.title && p.title.toLowerCase().includes(searchTerm.toLowerCase()))
                : pages;

            console.log(`📄 ${filtered.length} páginas encontradas:\n`);
            filtered.forEach((page, i) => {
                console.log(`${i + 1}. ${page.title || '(sin título)'}`);
                console.log(`   ID: ${page.id}`);
                console.log(`   Sección: ${page.parentSection?.displayName || 'N/A'}`);
                console.log();
            });

        } else if (args[0] === '--page' && args[1]) {
            const pageId = args[1];
            const meta = await httpsGet('graph.microsoft.com',
                `/v1.0/me/onenote/pages/${pageId}?$select=id,title,parentSection`,
                authHeader);
            console.log(`📌 Título: ${meta.title || 'N/A'}\n`);

            const html = await httpsGetRaw('graph.microsoft.com',
                `/v1.0/me/onenote/pages/${pageId}/content`,
                { ...authHeader, 'Accept': 'text/html' });
            console.log('📝 Contenido:\n');
            console.log(htmlToText(html));

        } else {
            console.log('Uso:');
            console.log('  node read_onenote.js --auth                    # Autenticarse (primera vez)');
            console.log('  node read_onenote.js --token <code>            # Guardar token tras auth');
            console.log('  node read_onenote.js --list-pages              # Listar todas las páginas');
            console.log('  node read_onenote.js --search "Pendiente"      # Buscar páginas por título');
            console.log('  node read_onenote.js --page <page-id>          # Leer una página');
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
