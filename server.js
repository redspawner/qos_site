require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// As bibliotecas da Google só são carregadas quando são precisas pela primeira vez
// (ver "googleAuth" mais abaixo). Antes usava-se o pacote "googleapis" completo, que
// demorava vários segundos a carregar cada vez que o servidor arrancava; agora usam-se
// apenas os dois módulos necessários (Sheets e Gmail), que carregam em milésimos de segundo.

const app = express();

// --- ADICIONADO PARA O RAILWAY: Permite ler o IP real e limpo do cliente ---
app.set('trust proxy', true);
app.disable('x-powered-by');

const PORT = process.env.PORT || 8080;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Memórias temporárias (Limpas automaticamente)
const mensagensRecentes = new Set();
const hitCounter = new Map(); // Para o limite de velocidade (Tática 1)

// Limpeza periódica do contador de visitas, para a memória não crescer para sempre
setInterval(() => {
    const limite = Date.now() - 10000;
    for (const [ip, hits] of hitCounter) {
        if (!hits.some(timestamp => timestamp > limite)) hitCounter.delete(ip);
    }
}, 60000).unref();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Pequenos cabeçalhos de segurança em todas as respostas
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// --- CONFIGURAÇÃO GOOGLE AUTH ---
let googleAuth = null;

function getGoogleAuth() {
    if (!googleAuth) {
        const { auth } = require('@googleapis/sheets');
        googleAuth = new auth.OAuth2(
            process.env.OAUTH_CLIENT_ID,
            process.env.OAUTH_CLIENT_SECRET,
            "https://developers.google.com/oauthplayground"
        );
        googleAuth.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });
    }
    return googleAuth;
}

async function appendToSheet(sheetName, values) {
    try {
        const { sheets: googleSheets } = require('@googleapis/sheets');
        const sheets = googleSheets({ version: 'v4', auth: getGoogleAuth() });
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:Z`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [values] },
        });
    } catch (err) {
        console.error(`Erro Sheets (${sheetName}):`, err.message);
        throw err; // Propaga o erro para que as rotas saibam se a gravação falhou
    }
}

// Extrai apenas o primeiro IP se vier uma lista do proxy
function getIp(req) {
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Desconhecido';
    if (ip && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    return ip;
}

// Data e hora de Lisboa, no formato usado nas folhas de cálculo
function dataHoraLisboa() {
    const now = new Date();
    return {
        data: now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' }),
        hora: now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' }),
    };
}

// Evita que texto vindo de fora seja interpretado como HTML
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- FUNÇÃO EXTRATORA COM DUPLA PROTEÇÃO ANTI-BOT ---
async function registarVisita(req, acao) {
    try {
        const ip = getIp(req);
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
        const { data, hora } = dataHoraLisboa();
        const acceptLang = req.headers['accept-language'] || '';
        const idioma = acceptLang ? acceptLang.split(',')[0] : 'Desconhecido';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Acesso Direto';

        // Grava em segundo plano
        appendToSheet('Estatisticas', [data, hora, acao, ip, idioma, userAgent, referer]).catch(() => {});
    } catch (err) {
        console.error('Erro ao registar visita:', err.message);
    }
}

// --- FICHEIROS DO SITE (CACHE) ---
// As páginas HTML são sempre confirmadas com o servidor, para que uma alteração apareça logo.
// O CSS e o JS ficam 5 minutos no navegador e depois são atualizados em segundo plano.
// Imagens, vídeo e tipos de letra ficam guardados 30 dias no navegador do visitante:
// é isto que torna a segunda página (e as visitas seguintes) quase instantânea.
// NOTA: ao trocar uma imagem, dê-lhe um nome novo; com o mesmo nome, quem já visitou
// o site pode continuar a ver a antiga durante 30 dias.
const UM_DIA = 24 * 60 * 60;

function cacheHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    // Os vídeos têm de ser anunciados como "video/mp4" para tocarem em todos os navegadores (ex.: Safari)
    if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
    if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
    } else if (ext === '.css' || ext === '.js') {
        res.setHeader('Cache-Control', `public, max-age=300, stale-while-revalidate=${7 * UM_DIA}`);
    } else {
        res.setHeader('Cache-Control', `public, max-age=${30 * UM_DIA}`);
    }
}

const staticOptions = { setHeaders: cacheHeaders };

function enviarPagina(res, filePath) {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
}

// --- ROTAS DE PÁGINAS PRINCIPAIS ---
app.get('/qr', (req, res) => {
    registarVisita(req, 'SCAN QR');
    const qrPath = path.join(__dirname, 'qr.html');
    fs.existsSync(qrPath) ? enviarPagina(res, qrPath) : res.redirect('/pt.html');
});

app.get('/', (req, res) => {
    registarVisita(req, 'VISITA HOME');
    enviarPagina(res, path.join(__dirname, 'pt.html'));
});

app.get('/pt.html', (req, res) => {
    registarVisita(req, 'VISITA (PT)');
    enviarPagina(res, path.join(__dirname, 'pt.html'));
});

app.get('/fr.html', (req, res) => {
    registarVisita(req, 'VISITA (FR)');
    enviarPagina(res, path.join(__dirname, 'fr.html'));
});

app.get('/eng.html', (req, res) => {
    registarVisita(req, 'VISITA (ENG)');
    enviarPagina(res, path.join(__dirname, 'eng.html'));
});

app.get('/favicon.ico', (req, res) => res.redirect(301, '/images/favicon.png'));

app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/images', express.static(path.join(__dirname, 'images'), staticOptions));

// --- ADICIONADO: ROTAS "ESPIÃS" PARA AS PASTAS ---
// Registam a visita no Excel e passam o controlo (next) para o express.static tratar dos ficheiros
app.get('/pt/', (req, res, next) => { registarVisita(req, 'VISITA PASTA (/pt/)'); next(); });
app.get('/fr/', (req, res, next) => { registarVisita(req, 'VISITA PASTA (/fr/)'); next(); });
app.get('/eng/', (req, res, next) => { registarVisita(req, 'VISITA PASTA (/eng/)'); next(); });

// As pastas das três línguas são servidas diretamente.
// (Antes servia-se a pasta inteira do projeto, o que deixava qualquer pessoa descarregar
// o próprio server.js, o package.json, etc. Agora só o que está nesta lista é público.)
app.use('/pt', express.static(path.join(__dirname, 'pt'), staticOptions));
// (/eng e /fr mostram o ecrã de confirmação de idade: eng.html e fr.html, tratados no CATCH-ALL)
app.use('/eng', express.static(path.join(__dirname, 'eng'), { ...staticOptions, redirect: false }));
app.use('/fr', express.static(path.join(__dirname, 'fr'), { ...staticOptions, redirect: false }));

// --- ENVIO DE EMAIL (GMAIL API) ---
async function sendEmail(to, subject, text) {
    const { gmail: googleGmail } = require('@googleapis/gmail');
    const gmail = googleGmail({ version: 'v1', auth: getGoogleAuth() });
    const message = [`From: ${process.env.OAUTH_USER_EMAIL}`, `To: ${to}`, `Subject: ${subject}`, ``, text].join('\n');
    const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}

// --- FORMULÁRIO DE CONTACTO (/submit-form) ---
app.post('/submit-form', (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '' } = req.body || {};

    const ip = getIp(req);

    const urlDestino = { 'pt': '/enviado', 'fr': '/envoye', 'eng': '/sent' }[lang] || '/pt.html';

    const assinatura = `contact-${ip}-${email}-${message}`;
    if (mensagensRecentes.has(assinatura)) return res.redirect(urlDestino);

    mensagensRecentes.add(assinatura);
    setTimeout(() => mensagensRecentes.delete(assinatura), 15000);

    res.redirect(urlDestino);

    (async () => {
        const { data, hora } = dataHoraLisboa();
        await appendToSheet('Contactos', [data, hora, String(lang).toUpperCase(), name, email, message]);
        const recipients = (process.env.NOTIFY_TO || '').split(',').map(e => e.trim()).filter(Boolean);
        for (const to of recipients) {
            await sendEmail(to, `Mensagem Site - ${String(lang).toUpperCase()}`, `Nome: ${name}\nEmail: ${email}\nMensagem:\n${message}`);
        }
    })().catch(err => console.error("Erro form (/submit-form):", err.message));
});

// --- FORMULÁRIO DE STOCK (/stocking) ---
app.post('/stocking', async (req, res) => {
    const { lang = 'pt', name = '', email = '', message = '', operacao = '' } = req.body || {};

    // Descobre de que página o utilizador veio
    const urlDestino = escapeHtml(req.headers.referer || '/pt.html');

    // --- 1. VALIDAÇÕES SECRETAS ---
    const cleanName = String(email).trim();
    const cleanEmail = String(name).trim();
    const cleanMessage = String(message).trim();
    const cleanOperacao = String(operacao).trim().toLowerCase();

    // A lista pode ser definida no Railway com a variável STOCK_USERS (nomes separados por vírgulas),
    // para não ficar escrita no código. Se a variável não existir, usa-se a lista abaixo.
    const nomesPermitidos = process.env.STOCK_USERS
        ? process.env.STOCK_USERS.split(',').map(n => n.trim()).filter(Boolean)
        : ['a@ndreia', 'f@bio', 'm@rio', 'p@ula', 'f@ernando'];
    const isNameValid = nomesPermitidos.includes(cleanName);

    const isEmailValid = ['1', '2', '3', '4', '5','99'].includes(cleanEmail);

    const msgNumber = Number(cleanMessage);
    const isMessageValid = Number.isInteger(msgNumber) && msgNumber >= 1 && msgNumber <= 9999;

    const isOperacaoValid = ['consumo', 'vendas'].includes(cleanOperacao);

    // Se INVÁLIDO -> Mostra página de erro e pára aqui
    if (!isNameValid || !isEmailValid || !isMessageValid || !isOperacaoValid) {
        return res.status(400).send(`
            <h2>Acesso Negado</h2>
            <p>Os dados inseridos estão incorretos ou não tens permissão para efetuar esta ação.</p>
            <a href="${urlDestino}">Voltar à página anterior</a>
        `);
    }
    // --- FIM DAS VALIDAÇÕES ---

    const ip = getIp(req);

    // Sistema de prevenção de spam
    const assinatura = `stock-${ip}-${cleanEmail}-${cleanMessage}`;
    if (mensagensRecentes.has(assinatura)) {
        return res.redirect(req.headers.referer || '/pt.html');
    }

    mensagensRecentes.add(assinatura);
    setTimeout(() => mensagensRecentes.delete(assinatura), 15000);

    // --- GRAVAR NO GOOGLE SHEETS PRIMEIRO ---
    try {
        const { data, hora } = dataHoraLisboa();

        // O "await" obriga o servidor a esperar que a gravação acabe
        await appendToSheet('Stock', [data, hora, String(lang).toUpperCase(), cleanName, cleanEmail, cleanMessage, cleanOperacao]);

        // --- MENSAGEM DE SUCESSO ---
        res.send(`
            <h2>Registo Feito</h2>
            <p>Os dados foram validados e guardados com sucesso.</p>
            <a href="${urlDestino}">Voltar à página anterior</a>
        `);
    } catch (err) {
        console.error("Erro form stocking:", err.message);
        res.status(500).send(`
            <h2>Erro Interno</h2>
            <p>Os dados estavam corretos, mas ocorreu um erro ao guardar. Tenta novamente.</p>
            <a href="${urlDestino}">Voltar à página anterior</a>
        `);
    }
});

// --- CATCH-ALL ---
// Endereços "limpos": /pt/vinho_tinto mostra pt/vinho_tinto.html, /enviado mostra enviado.html, etc.
// (os endereços antigos terminados em .html continuam a funcionar)
// Só são aceites páginas das três línguas e as páginas .html da raiz do projeto.
const PAGINA_VALIDA = /^(?:(?:pt|eng|fr)\/)?[a-z0-9_-]+$/i;

app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    let relRequested;
    try {
        relRequested = decodeURIComponent(req.path || '').replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '') || 'pt';
    } catch (err) {
        return next(); // endereço mal formado
    }
    if (!PAGINA_VALIDA.test(relRequested)) return next();

    const candidate = path.join(__dirname, relRequested + '.html');
    fs.access(candidate, fs.constants.R_OK, (err) => {
        if (!err) {
            registarVisita(req, `VISITA LINK (/${relRequested})`);
            return enviarPagina(res, candidate);
        }
        next();
    });
});

app.use((req, res) => res.status(404).send('404: Not Found'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
