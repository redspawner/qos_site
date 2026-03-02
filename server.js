require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();
app.set('trust proxy', true);

const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const mensagensRecentes = new Set();
const hitCounter = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (fs.existsSync(path.join(__dirname, 'images', 'favicon.svg'))) {
    app.use(favicon(path.join(__dirname, 'images', 'favicon.svg')));
}

// --- CONFIGURAÇÃO GOOGLE AUTH ---
const oAuth2Client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

async function appendToSheet(sheetName, values) {
    try {
        const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:Z`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [values] },
        });
    } catch (err) {
        console.error(`Erro Sheets:`, err.message);
    }
}

// --- 1. O "ESPIÃO" DE ESTATÍSTICAS (Regista sem interferir nas pastas) ---
app.use((req, res, next) => {
    // Ignora ficheiros de sistema, imagens, css, js para não poluir o Excel
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/assets') || req.path.startsWith('/images') || req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|mp4|webm|ico)$/)) {
        return next(); 
    }

    try {
        let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();

        const userAgent = req.headers['user-agent'] || 'Desconhecido';
        const isBot = /bot|crawl|spider|facebookexternalhit|whatsapp|preview/i.test(userAgent);
        
        if (!isBot) {
            const nowMs = Date.now();
            const userHits = hitCounter.get(ip) || [];
            const recentHits = userHits.filter(ts => nowMs - ts < 10000);
            
            if (recentHits.length <= 8) {
                recentHits.push(nowMs);
                hitCounter.set(ip, recentHits);

                const now = new Date();
                const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
                const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
                const idioma = (req.headers['accept-language'] || '').split(',')[0];
                const referer = req.headers['referer'] || 'Acesso Direto';
                const acao = `VISITA ${req.path}`;

                // Grava no Excel em background
                appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]);
            }
        }
    } catch (e) {
        console.error('Erro tracking:', e.message);
    }

    // PASSA O CONTROLO PARA O MOTOR NORMAL DO EXPRESS (Isto é o que resolve o teu problema)
    next();
});

// --- 2. ROTAS DIRETAS ---
app.get('/', (req, res) => {
    res.redirect('/pt/'); // Adapta para '/pt' se a tua home principal não for uma pasta
});

app.post('/submit-form', (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body;
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();

    const urlDestino = { 'pt': '/enviado', 'fr': '/envoye', 'eng': '/sent' }[lang] || '/pt/';
    
    const assinatura = `${ip}-${email}-${message}`;
    if (mensagensRecentes.has(assinatura)) return res.redirect(urlDestino);
    mensagensRecentes.add(assinatura);
    setTimeout(() => mensagensRecentes.delete(assinatura), 15000);

    res.redirect(urlDestino);

    (async () => {
        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        await appendToSheet('Contactos', [data, hora, lang.toUpperCase(), name, email, message]);
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const recipients = (process.env.NOTIFY_TO || '').split(',').map(e => e.trim()).filter(Boolean);
        for (const to of recipients) {
            const emailBody = [`From: ${process.env.OAUTH_USER_EMAIL}`, `To: ${to}`, `Subject: Mensagem Site - ${lang.toUpperCase()}`, ``, `Nome: ${name}\nEmail: ${email}\nMensagem:\n${message}`].join('\n');
            const encoded = Buffer.from(emailBody).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
        }
    })().catch(err => console.error("Erro form:", err.message));
});

// --- 3. O MOTOR NATURAL DO EXPRESS (Substitui o Catch-all que estragou tudo) ---
// Ele procura os ficheiros automaticamente. Se pedires /pt, ele entrega pt.html. 
// Se pedires /pt/, ele vai à pasta pt e entrega o index.html. 
// O CSS (com ou sem ../) voltará a funcionar nativamente.
app.use(express.static(__dirname, {
    extensions: ['html'],
    index: 'index.html'
}));

// Se nada for encontrado (404)
app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
