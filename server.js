require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon');

const app = express();

// --- ADICIONADO PARA O RAILWAY: Permite ler o IP real e limpo do cliente ---
app.set('trust proxy', true);

const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Memórias temporárias (Limpas automaticamente)
const mensagensRecentes = new Set();
const hitCounter = new Map(); // Para o limite de velocidade (Tática 1)

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

// --- FUNÇÃO EXTRATORA COM DUPLA PROTEÇÃO ANTI-BOT ---
async function registarVisita(req, acao) {
    try {
        // --- ADICIONADO: Extrai apenas o primeiro IP se vier uma lista do proxy ---
        let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
        if (ip && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }

        const userAgent = req.headers['user-agent'] || 'Desconhecido';

        // 1. Bloqueio por palavras-chave (Opção 1)
        const isBot = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|link|fetch/i.test(userAgent);
        if (isBot) return;

        // 2. Limite de velocidade por IP (Tática 1 - Máx 6 cliques/10seg)
        const nowMs = Date.now();
        const userHits = hitCounter.get(ip) || [];
        const recentHits = userHits.filter(timestamp => nowMs - timestamp < 10000);
        
        if (recentHits.length > 6) {
            console.log(`[BOT DETECTADO POR VELOCIDADE] IP: ${ip}`);
            return; 
        }
        
        recentHits.push(nowMs);
        hitCounter.set(ip, recentHits);

        // Se passar os testes, prepara os dados
        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const acceptLang = req.headers['accept-language'] || '';
        const idioma = acceptLang ? acceptLang.split(',')[0] : 'Desconhecido';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Acesso Direto';

        // Grava em segundo plano
        appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]);
    } catch (err) {
        console.error('Erro ao registar visita:', err.message);
    }
}

// --- ROTAS DE PÁGINAS PRINCIPAIS ---
app.get('/qr', (req, res) => {
    registarVisita(req, 'SCAN QR');
    const qrPath = path.join(__dirname, 'qr.html');
    fs.existsSync(qrPath) ? res.sendFile(qrPath) : res.redirect('/pt.html');
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

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- ADICIONADO: ROTAS "ESPIÃS" PARA AS PASTAS ---
// Registam a visita no Excel e passam o controlo (next) para o express.static tratar dos ficheiros
app.get('/pt/', (req, res, next) => { registarVisita(req, 'VISITA PASTA (/pt/)'); next(); });
app.get('/fr/', (req, res, next) => { registarVisita(req, 'VISITA PASTA (/fr/)'); next(); });
app.get('/eng/', (req, res, next) => { registarVisita(req, 'VISITA PASTA (/eng/)'); next(); });

// O motor mágico que faz as tuas pastas e ficheiros funcionarem nativamente
app.use(express.static(__dirname));

// --- FORMULÁRIO ---
async function sendEmail(to, subject, text) {
}

app.post('/stocking', async (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body;
    
    // Descobre de que página o utilizador veio
    const urlDestino = req.headers.referer || '/pt.html';

    // --- 1. VALIDAÇÕES SECRETAS ---
    const cleanName = email.trim();
    const cleanEmail = name.trim();
    const cleanMessage = message.trim();

    const nomesPermitidos = ['a@ndreia', 'f@bio','m@rio','p@ula','f@ernando']; 
    const isNameValid = nomesPermitidos.includes(cleanName);

    const isEmailValid = ['1', '2', '3', '4', '5'].includes(cleanEmail);

    const msgNumber = Number(cleanMessage);
    const isMessageValid = Number.isInteger(msgNumber) && msgNumber >= -9999 && msgNumber <= 9999;

    // Se INVÁLIDO -> Mostra página de erro e pára aqui
    if (!isNameValid || !isEmailValid || !isMessageValid) {
        return res.status(400).send(`
            <h2>Acesso Negado</h2>
            <p>Os dados inseridos estão incorretos ou não tens permissão para efetuar esta ação.</p>
            <a href="${urlDestino}">Voltar à página anterior</a>
        `);
    }
    // --- FIM DAS VALIDAÇÕES ---

    // Limpeza do IP
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();

    // Sistema de prevenção de spam
    const assinatura = `${ip}-${cleanEmail}-${cleanMessage}`;
    if (mensagensRecentes.has(assinatura)) {
        // Se estiveres a testar repetidamente com os mesmos dados em menos de 15 segundos, ele ignora.
        return res.redirect(urlDestino);
    }

    mensagensRecentes.add(assinatura);
    setTimeout(() => mensagensRecentes.delete(assinatura), 15000);

    // --- GRAVAR NO GOOGLE SHEETS PRIMEIRO ---
    try {
        const now = new Date();
        const data = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const hora = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' });
        
        // O "await" obriga o servidor a esperar que a gravação acabe
        await appendToSheet('Stock', [data, hora, lang.toUpperCase(), cleanName, cleanEmail, cleanMessage]);

        // --- MENSAGEM DE SUCESSO ---
        // Só mostra esta página SE a gravação na folha de cálculo for bem sucedida
        res.send(`
            <h2>Registo Feito</h2>
            <p>Os dados foram validados e guardados com sucesso.</p>
            <a href="${urlDestino}">Voltar à página anterior</a>
        `);
    } catch (err) {
        console.error("Erro form stocking:", err.message);
        // Se falhar a gravação no Google, avisa o utilizador
        res.status(500).send(`
            <h2>Erro Interno</h2>
            <p>Os dados estavam corretos, mas ocorreu um erro ao guardar. Tenta novamente.</p>
            <a href="${urlDestino}">Voltar à página anterior</a>
        `);
    }
});


// --- CATCH-ALL ---
app.use((req, res, next) => {
    const relRequested = decodeURIComponent(req.path || '').replace(/^\/+|\/+$/g, '') || 'pt';
    const candidate = path.join(__dirname, relRequested + '.html');
    fs.access(candidate, fs.constants.R_OK, (err) => {
        if (!err) {
            registarVisita(req, `VISITA LINK (/${relRequested})`);
            return res.sendFile(candidate);
        }
        next();
    });
});

app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
