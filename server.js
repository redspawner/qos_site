require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();
// Essencial para o Railway passar o IP real do cliente
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
        console.error(`Erro Sheets (${sheetName}):`, err.message);
    }
}

async function registarVisita(req, acao) {
    try {
        // Captura o IP e limpa (pega apenas o primeiro se houver lista)
        let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();

        const userAgent = req.headers['user-agent'] || 'Desconhecido';
        const isBot = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|link|fetch/i.test(userAgent);
        if (isBot) return;

        const nowMs = Date.now();
        const userHits = hitCounter.get(ip) || [];
        const recentHits = userHits.filter(ts => nowMs - ts < 10000);
        if (recentHits.length > 8) return; 
        
        recentHits.push(nowMs);
        hitCounter.set(ip, recentHits);

        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const acceptLang = req.headers['accept-language'] || '';
        const idioma = acceptLang ? acceptLang.split(',')[0] : 'Desconhecido';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Acesso Direto';

        // Envia os dados para o Excel (O País será calculado lá por fórmula)
        appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]);
    } catch (err) {
        console.error('Erro no registo:', err.message);
    }
}

// --- SERVIR ASSETS ---
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- ROTAS ESPECÍFICAS ---
app.get('/qr', (req, res) => {
    registarVisita(req, 'SCAN QR');
    res.sendFile(path.join(__dirname, 'qr.html'));
});

app.get('/', (req, res) => {
    res.redirect('/pt');
});

app.post('/submit-form', (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body;
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();

    const urlDestino = { 'pt': '/enviado', 'fr': '/envoye', 'eng': '/sent' }[lang] || '/pt';

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
        const recipients = (process.env.NOTIFY_TO || '').split(',').map(e => e.trim()).filter(Boolean);
        for (const to of recipients) {
            await sendEmail(to, `Mensagem Site - ${lang.toUpperCase()}`, `Nome: ${name}\nEmail: ${email}\nMensagem:\n${message}`);
        }
    })().catch(err => console.error("Erro form:", err.message));
});

// --- CATCH-ALL (Resolve a tela azul e links como /pt/) ---
app.use((req, res, next) => {
    const reqPathDecoded = decodeURIComponent(req.path || '');
    let cleanPath = reqPathDecoded.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');

    if (cleanPath === '') cleanPath = 'pt';

    // Tenta encontrar o ficheiro na raiz
    const targetFile = path.join(__dirname, cleanPath + '.html');
    if (fs.existsSync(targetFile) && fs.lstatSync(targetFile).isFile()) {
        registarVisita(req, `VISITA (/${cleanPath})`);
        return res.sendFile(targetFile);
    }

    // Suporte para caminhos como /pt/azeite
    const lastPart = cleanPath.split('/').pop();
    const subTarget = path.join(__dirname, lastPart + '.html');
    if (fs.existsSync(subTarget) && fs.lstatSync(subTarget).isFile()) {
        registarVisita(req, `VISITA SUB (/${lastPart})`);
        return res.sendFile(subTarget);
    }

    next();
});

app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
