require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();
const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Memórias temporárias (Limpas automaticamente ao reiniciar o server)
const mensagensRecentes = new Set();
const hitCounter = new Map(); // Para o limite de velocidade (Anti-Bot)

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

// --- FUNÇÃO DE REGISTO COM DUPLA PROTEÇÃO (BOTS & VELOCIDADE) ---
async function registarVisita(req, acao) {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
        const userAgent = req.headers['user-agent'] || 'Desconhecido';

        // 1. Bloqueio por palavras-chave (Motores de busca e Scrapers)
        const isBot = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|link|fetch/i.test(userAgent);
        if (isBot) return;

        // 2. Limite de velocidade (Máx 6 registros a cada 10 segundos por IP)
        const nowMs = Date.now();
        const userHits = hitCounter.get(ip) || [];
        const recentHits = userHits.filter(timestamp => nowMs - timestamp < 10000);
        
        if (recentHits.length > 6) {
            return; // Ignora o registo se for demasiado rápido
        }
        
        recentHits.push(nowMs);
        hitCounter.set(ip, recentHits);

        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const acceptLang = req.headers['accept-language'] || '';
        const idioma = acceptLang ? acceptLang.split(',')[0] : 'Desconhecido';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Acesso Direto';

        // Dispara e esquece (Não trava o carregamento do site)
        appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]);
    } catch (err) {
        console.error('Erro ao registar visita:', err.message);
    }
}

// --- ROTAS ESTÁTICAS (Imagens e Assets) ---
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- ROTAS DE PÁGINAS EXPLÍCITAS ---
app.get('/qr', (req, res) => {
    registarVisita(req, 'SCAN QR');
    const qrPath = path.join(__dirname, 'qr.html');
    fs.existsSync(qrPath) ? res.sendFile(qrPath) : res.redirect('/pt.html');
});

app.get('/', (req, res) => {
    registarVisita(req, 'VISITA HOME');
    res.sendFile(path.join(__dirname, 'pt.html'));
});

// --- FORMULÁRIO DE CONTACTO ---
async function sendEmail(to, subject, text) {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const message = [`From: ${process.env.OAUTH_USER_EMAIL}`, `To: ${to}`, `Subject: ${subject}`, ``, text].join('\n');
    const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}

app.post('/submit-form', (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const urlDestino = { 'pt': '/enviado', 'fr': '/envoye', 'eng': '/sent' }[lang] || '/pt.html';

    const assinatura = `${ip}-${email}-${message}`;
    if (mensagensRecentes.has(assinatura)) return res.redirect(urlDestino);

    mensagensRecentes.add(assinatura);
    setTimeout(() => mensagensRecentes.delete(assinatura), 15000);

    res.redirect(urlDestino); // Redireciona logo para ser rápido

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

// --- CATCH-ALL (Suporte a /pt, /pt/, index.html e links truncados) ---
app.use((req, res, next) => {
    const reqPathDecoded = decodeURIComponent(req.path || '');
    // Remove as barras das pontas para análise (Ex: /pt/ vira pt)
    let relRequested = reqPathDecoded.replace(/^\/+|\/+$/g, '');

    // Se o pedido for vazio ou apenas "/", assume "pt"
    if (relRequested === '') relRequested = 'pt';

    const directFile = path.join(__dirname, relRequested + '.html');
    const folderIndex = path.join(__dirname, relRequested, 'index.html');

    // 1. Tenta ficheiro direto (pt.html)
    if (fs.existsSync(directFile) && fs.lstatSync(directFile).isFile()) {
        registarVisita(req, `VISITA (/${relRequested})`);
        return res.sendFile(directFile);
    } 

    // 2. Tenta index dentro de pasta (pt/index.html)
    if (fs.existsSync(folderIndex)) {
        registarVisita(req, `VISITA PASTA (/${relRequested}/)`);
        return res.sendFile(folderIndex);
    }

    // 3. Fallback final: se nada funcionar mas pedir algo relacionado com "pt", envia a home
    if (relRequested.startsWith('pt')) {
        registarVisita(req, 'VISITA HOME (FALLBACK)');
        return res.sendFile(path.join(__dirname, 'pt.html'));
    }

    next();
});

app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
