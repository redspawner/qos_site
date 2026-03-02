require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();
// Essencial para obteres os IPs limpos
app.set('trust proxy', true);

const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const mensagensRecentes = new Set();
const hitCounter = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 1. ASSETS ESTÁTICOS (Sempre servidos primeiro para evitar tela azul) ---
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

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
    } catch (err) {}
}

// --- ESPIÃO DE ESTATÍSTICAS ---
app.use((req, res, next) => {
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

                appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]);
            }
        }
    } catch (e) {}
    next();
});

// --- ROTAS BASE ---
app.get('/', (req, res) => {
    res.redirect('/pt'); // Apenas /pt, sem barra final
});

// --- FORMULÁRIO ---
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
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const recipients = (process.env.NOTIFY_TO || '').split(',').map(e => e.trim()).filter(Boolean);
        for (const to of recipients) {
            const emailBody = [`From: ${process.env.OAUTH_USER_EMAIL}`, `To: ${to}`, `Subject: Mensagem Site - ${lang.toUpperCase()}`, ``, `Nome: ${name}\nEmail: ${email}\nMensagem:\n${message}`].join('\n');
            const encoded = Buffer.from(emailBody).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
        }
    })().catch(err => console.error("Erro form:", err.message));
});

// --- O ROTEADOR EXATO (Resolve todos os problemas de 404 e pastas) ---
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();

    // Verifica se o utilizador digitou a barra final no URL (ex: /pt/ ou /fr/)
    const isTrailingSlash = req.path.endsWith('/');
    
    // Tira as barras para sabermos o nome limpo da língua/página (ex: "fr" ou "eng")
    const cleanPath = req.path.replace(/^\/+|\/+$/g, '');

    // 1. O utilizador pediu uma PASTA (tem barra no fim)
    if (isTrailingSlash) {
        const folderIndex = path.join(__dirname, cleanPath, 'index.html');
        if (fs.existsSync(folderIndex)) {
            return res.sendFile(folderIndex);
        }
    } 
    // 2. O utilizador pediu uma PÁGINA (não tem barra no fim)
    else {
        // Tenta encontrar o ficheiro na raiz (ex: fr.html, eng.html)
        const rootFile = path.join(__dirname, cleanPath + '.html');
        if (fs.existsSync(rootFile)) {
            return res.sendFile(rootFile);
        }
        
        // Tenta encontrar subpáginas (ex: /pt/vinho_tinto -> /pt/vinho_tinto.html)
        const subPageFile = path.join(__dirname, cleanPath + '.html');
        if (fs.existsSync(subPageFile)) {
             return res.sendFile(subPageFile);
        }
    }

    // Se chegou aqui, a página não existe
    next();
});

app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
