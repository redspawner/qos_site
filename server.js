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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 1. ASSETS ESTÁTICOS (Sempre Absolutos) ---
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- 2. LOGICA DE VISITAS ---
async function registarVisita(req, acao) {
    try {
        let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
        if (ip.includes(',')) ip = ip.split(',')[0].trim();
        const userAgent = req.headers['user-agent'] || 'Desconhecido';
        if (/bot|crawl|spider|facebookexternalhit|whatsapp/i.test(userAgent)) return;

        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        
        // Google Sheets (Ordem: Data, Hora, Ação, IP, Idioma, UserAgent, Referer)
        const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Estatisticas!A:Z',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[data, hora, acao, ip, (req.headers['accept-language'] || '').split(',')[0], userAgent, req.headers['referer'] || 'Direto']] },
        });
    } catch (e) {}
}

// --- 3. MAPEAMENTO DE ROTAS DISTINTAS ---

// Rota para /pt (Ficheiro pt.html na raiz)
app.get('/pt', (req, res) => {
    registarVisita(req, 'VISITA HOME PT');
    res.sendFile(path.join(__dirname, 'pt.html'));
});

// Rota para /pt/ (Página diferente, ex: um index.html dentro da pasta pt)
app.get('/pt/', (req, res) => {
    const folderIndex = path.join(__dirname, 'pt', 'index.html');
    if (fs.existsSync(folderIndex)) {
        registarVisita(req, 'VISITA PASTA PT/');
        return res.sendFile(folderIndex);
    }
    // Se a pasta não existir, envia o pt.html da raiz como fallback
    res.sendFile(path.join(__dirname, 'pt.html'));
});

// Rota para subpáginas (ex: /pt/enoturismo)
app.get('/pt/:pagina', (req, res) => {
    const pagina = req.params.pagina;
    // Procura primeiro dentro da pasta /pt/
    const fileInFolder = path.join(__dirname, 'pt', pagina + '.html');
    // Se não houver pasta, procura na raiz
    const fileInRoot = path.join(__dirname, pagina + '.html');

    if (fs.existsSync(fileInFolder)) {
        registarVisita(req, `VISITA /pt/${pagina}`);
        return res.sendFile(fileInFolder);
    } else if (fs.existsSync(fileInRoot)) {
        registarVisita(req, `VISITA ${pagina}`);
        return res.sendFile(fileInRoot);
    }
    res.status(404).send('Página não encontrada');
});

// Raiz do site redireciona para a Landing Page
app.get('/', (req, res) => res.redirect('/pt'));

// Resto do código (Auth, Form, Listen...) segue igual
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor na porta ${PORT}`));
