require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();
const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Memória temporária para evitar envios duplicados no formulário
const mensagensRecentes = new Set();

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

// --- FUNÇÃO PARA ESCREVER NO GOOGLE SHEETS ---
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
        console.error(`Erro ao gravar na aba ${sheetName}:`, err.message);
    }
}

// --- FUNÇÃO PARA ENVIAR EMAIL ---
async function sendEmail(to, subject, text) {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const message = [
        `From: ${process.env.OAUTH_USER_EMAIL}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        ``,
        text
    ].join('\n');

    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
}

// --- FUNÇÃO EXTRATORA DE ESTATÍSTICAS (Roda em segundo plano) ---
async function registarVisita(req, acao) {
    try {
        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
        const userAgent = req.headers['user-agent'] || 'Desconhecido';
        const acceptLang = req.headers['accept-language'] || '';
        const idioma = acceptLang ? acceptLang.split(',')[0] : 'Desconhecido';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Acesso Direto';

        await appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]);
    } catch (err) {
        console.error('Erro ao registar visita:', err.message);
    }
}

// --- ROTAS DE PÁGINAS (Sem 'await' = Resposta Instantânea) ---
app.get('/qr', (req, res) => {
    registarVisita(req, 'SCAN QR'); // Fica a gravar em segundo plano
    const qrPath = path.join(__dirname, 'qr.html');
    fs.existsSync(qrPath) ? res.sendFile(qrPath) : res.redirect('/pt');
});

app.get('/', (req, res) => {
    registarVisita(req, 'VISITA HOME');
    res.sendFile(path.join(__dirname, 'pt.html'));
});

app.get('/pt.html', (req, res) => {
    registarVisita(req, 'VISITA (PT)');
    res.sendFile(path.join(__dirname, 'pt.html'));
});

app.get('/fr.html', (req, res) => {
    registarVisita(req, 'VISITA (FR)');
    res.sendFile(path.join(__dirname, 'fr.html'));
});

app.get('/eng.html', (req, res) => {
    registarVisita(req, 'VISITA (ENG)');
    res.sendFile(path.join(__dirname, 'eng.html'));
});

// --- FICHEIROS ESTÁTICOS ---
app.use(express.static(__dirname));
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- FORMULÁRIO DE CONTACTO (Resposta Instantânea) ---
app.post('/submit-form', (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const redirectMap = { 'pt': '/enviado', 'fr': '/envoye', 'eng': '/sent' };
    const urlDestino = redirectMap[lang] || '/pt.html';

    // 1. Verifica duplicação
    const assinatura = `${ip}-${email}-${message}`;
    if (mensagensRecentes.has(assinatura)) {
        return res.redirect(urlDestino);
    }

    mensagensRecentes.add(assinatura);
    setTimeout(() => mensagensRecentes.delete(assinatura), 15000);

    // 2. REDIRECIONA O CLIENTE IMEDIATAMENTE (O site fica super rápido)
    res.redirect(urlDestino);

    // 3. Processa e-mails e Google Sheets em segundo plano
    (async () => {
        try {
            const now = new Date();
            const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
            const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
            
            await appendToSheet('Contactos', [data, hora, lang.toUpperCase(), name, email, message]);

            const recipients = (process.env.NOTIFY_TO || '').split(',').map(e => e.trim()).filter(Boolean);
            for (const to of recipients) {
                await sendEmail(to, `Mensagem Site - ${lang.toUpperCase()}`, `Nome: ${name}\nEmail: ${email}\nMensagem:\n${message}`);
            }
        } catch (err) {
            console.error("Erro ao processar formulário:", err.message);
        }
    })();
});

// --- CATCH-ALL (Acessos genéricos, fallback) ---
app.use((req, res, next) => {
    const reqPathDecoded = decodeURIComponent(req.path || '');
    const relRequested = reqPathDecoded.replace(/^\/+|\/+$/g, '') || 'pt';
    const candidate = path.join(__dirname, relRequested + '.html');

    fs.access(candidate, fs.constants.R_OK, (err) => {
        if (!err) {
            registarVisita(req, `VISITA LINK (/${relRequested})`); // Segundo plano
            return res.sendFile(candidate);
        }
        next();
    });
});

app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
