require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();
const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // 👈 Variável com o ID do teu Google Sheets

// 1. Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Favicon
if (fs.existsSync(path.join(__dirname, 'images', 'favicon.svg'))) {
    app.use(favicon(path.join(__dirname, 'images', 'favicon.svg')));
}

// 2. Ficheiros Estáticos
app.use(express.static(__dirname));
app.use('/images', express.static(path.join(__dirname, 'images')));

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
            range: `${sheetName}!A:Z`, // Permite até 26 colunas de forma flexível
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

    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage }
    });
}

// 3. Rota do QR (Registo de acessos)
app.get('/qr', async (req, res) => {
    try {
        // Gera a data e a hora separadas no fuso horário local
        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Grava no Google Sheets (Aba: QR_Logs)
        await appendToSheet('QR_Logs', [data, hora, 'SCAN', ip]);

        // Grava no ficheiro de texto (backup local)
        const logLine = `${now.toISOString()} — [QR VISIT] — IP: ${ip}\n`;
        fs.appendFile(path.join(__dirname, 'qr.txt'), logLine, () => {});

        // Tenta enviar o qr.html, se não existir, vai para a home
        const qrPath = path.join(__dirname, 'qr.html');
        if (fs.existsSync(qrPath)) {
            res.sendFile(qrPath);
        } else {
            res.redirect('/pt');
        }
    } catch (e) {
        console.error("Erro na rota /qr:", e);
        res.redirect('/pt');
    }
});

// 5. Rotas de Páginas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/pt.html', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/fr.html', (req, res) => res.sendFile(path.join(__dirname, 'fr.html')));
app.get('/eng.html', (req, res) => res.sendFile(path.join(__dirname, 'eng.html')));

// 6. Handler do Formulário
app.post('/submit-form', async (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body;
    
    // Gera a data e a hora separadas no fuso horário local
    const now = new Date();
    const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
    const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
    
    // Grava no Google Sheets (Aba: Contactos)
    await appendToSheet('Contactos', [data, hora, lang.toUpperCase(), name, email, message]);

    // Grava no ficheiro de texto (backup local)
    const logLine = `${now.toISOString()} — [${lang}] ${name} <${email}>: ${message}\n`;
    fs.appendFile(path.join(__dirname, 'submissions.txt'), logLine, () => {});

    const recipients = (process.env.NOTIFY_TO || '').split(',').map(e => e.trim()).filter(Boolean);

    try {
        for (const to of recipients) {
            await sendEmail(
                to,
                `New message from site (${lang.toUpperCase()})`,
                `Recebeste uma nova mensagem (lingua=${lang}):\n\nNome: ${name}\nEmail: ${email}\nMensagem:\n${message}`
            );
        }
    } catch (err) {
        console.error("Erro ao enviar email:", err);
    }

    const redirectMap = { 'pt': '/enviado', 'fr': '/envoye', 'eng': '/sent' };
    res.redirect(redirectMap[lang] || '/pt.html');
});

// 7. Catch-all (Fallback para HTML)
app.use((req, res, next) => {
    const reqPathDecoded = decodeURIComponent(req.path || '');
    const relRequested = reqPathDecoded.replace(/^\/+|\/+$/g, '') || 'pt';
    const candidate = path.join(__dirname, relRequested + '.html');

    fs.access(candidate, fs.constants.R_OK, (err) => {
        if (!err) return res.sendFile(candidate);
        next();
    });
});

// 404
app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
