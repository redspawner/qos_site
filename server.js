require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 8080;

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// OAuth2 setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

// Gmail API sender
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

// -----------------------------
// 1️⃣ Serve root-level HTML files
// -----------------------------
app.get(['/', '/pt.html', '/eng.html', '/fr.html'], (req, res, next) => {
  const filePath = req.path === '/' ? path.join(__dirname, 'pt.html') : path.join(__dirname, req.path);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  next();
});

// -----------------------------
// 2️⃣ Redirect /pt/index.html → /pt/
// -----------------------------
app.use((req, res, next) => {
  if (req.path === '/pt/index.html') return res.redirect(301, '/pt/');
  if (req.path === '/eng/vinification.html') return res.redirect(301, '/eng/');
  if (req.path === '/fr/vinification.html') return res.redirect(301, '/fr/');
  next();
});

// -----------------------------
// 3️⃣ Serve language main pages
// -----------------------------
app.get(['/pt', '/pt/'], (req, res) => {
  const filePath = path.join(__dirname, 'pt', 'index.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).send('404: Not Found');
});

app.get(['/eng', '/eng/'], (req, res) => {
  const filePath = path.join(__dirname, 'eng', 'vinification.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).send('404: Not Found');
});

app.get(['/fr', '/fr/'], (req, res) => {
  const filePath = path.join(__dirname, 'fr', 'vinification.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).send('404: Not Found');
});

// -----------------------------
// 4️⃣ Serve any page inside language folders
// Example: /pt/sobre_nos → /pt/sobre_nos.html
// -----------------------------
app.get('/:lang/:page', (req, res, next) => {
  const langFolders = ['pt', 'eng', 'fr'];
  const { lang, page } = req.params;
  if (!langFolders.includes(lang)) return next();

  const filePath = path.join(__dirname, lang, `${page}.html`);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  next();
});

// -----------------------------
// 5️⃣ General .html → extensionless redirect (root-level files)
// -----------------------------
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath)) {
      const clean = req.path.slice(0, -5);
      return res.redirect(301, clean || '/');
    }
  }
  next();
});

// -----------------------------
// 6️⃣ Serve any other root-level HTML file without extension
// -----------------------------
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/assets') || req.path.startsWith('/images') || req.path.includes('.')) return next();
  const filePath = path.join(__dirname, `${req.path}.html`);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  next();
});

// -----------------------------
// 7️⃣ Form handler
// -----------------------------
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;
  const logLine = `${new Date().toISOString()} — [${lang}] ${name} <${email}>: ${message}\n`;
  fs.appendFile(path.join(__dirname, 'submissions.txt'), logLine, err => {
    if (err) console.error('❌ Error writing submissions.txt:', err);
  });

  const recipients = process.env.NOTIFY_TO.split(',').map(e => e.trim());
  try {
    for (const to of recipients) {
      await sendEmail(
        to,
        `New message from site (${lang.toUpperCase()})`,
        `Recebeste uma nova mensagem (lingua=${lang}):\n\nNome: ${name}\nEmail: ${email}\nMensagem:\n${message}`
      );
    }
  } catch (err) {
    console.error('❌ Gmail API send error:', err);
  }

  if (lang === 'pt') return res.redirect('/pt/enviado');
  if (lang === 'fr') return res.redirect('/fr/envoye');
  if (lang === 'eng') return res.redirect('/eng/sent');
  res.redirect('/');
});

// -----------------------------
// 8️⃣ 404 fallback
// -----------------------------
app.use((req, res) => res.status(404).send('404: Not Found'));

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
