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

// --- 1. ASSETS ESTÁTICOS NO TOPO (Garante que nunca há Tela Azul) ---
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

// --- 2. O ESPIÃO DE ESTATÍSTICAS ---
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

// --- 3. REDIRECIONAMENTO DA RAIZ ---
app.get('/', (req, res) => {
    res.redirect('/pt'); // Envia para a landing page (sem barra)
});

// --- 4. FORMULÁRIO DE CONTACTO ---
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

// --- 5. O ROTEADOR ABSOLUTO (Fim do conflito Pasta vs Ficheiro) ---
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();

    // Ignora rotas que já têm uma extensão (ex: ficheiros estáticos que passaram despercebidos)
    if (req.path.match(/\.[^/]+$/)) return next();

    let targetPath;

    // A REGRA:
    // Se o utilizador escreveu uma barra no fim (ex: /pt/ ou /fr/)...
    if (req.path.endsWith('/')) {
        // ...ele quer o ficheiro index.html DENTRO dessa pasta.
        targetPath = path.join(__dirname, req.path, 'index.html');
    } 
    // Se NÃO tem barra no fim (ex: /pt ou /fr ou /pt/vinho_tinto)...
    else {
        // ...ele quer um ficheiro .html com esse nome exato.
        targetPath = path.join(__dirname, req.path + '.html');
    }

    // Verifica se o ficheiro calculado existe fisicamente
    fs.access(targetPath, fs.constants.R_OK, (err) => {
        if (!err) {
            // Se existir, entrega-o sem fazer nenhum redirecionamento!
            return res.sendFile(targetPath);
        }
        // Se não existir, passa para a página 404
        next();
    });
});

app.use((req, res) => res.status(404).send('404: Página não encontrada'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
