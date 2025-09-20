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
// 1️⃣ Serve root-level HTML files directly
// -----------------------------
const rootPages = ['pt.html', 'eng.html', 'fr.html', 'enviado.html', 'sent.html', 'envoye.html'];
app.get(rootPages.map(p => '/' + p), (req, res, next) => {
  const filePath = path.join(__dirname, req.path.slice(1));
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  next();
});

// -----------------------------
// 2️⃣ Redirect only explicit /pt/index.html, /eng/vinification.html, /fr/vinification.html → clean folder URL
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
// 4️⃣ Serve pages inside language folders
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
// 5️⃣ Form handler
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

  // Redirect to root-level confirmation pages
  if (lang === 'pt') return res.redirect('/enviado');
  if (lang === 'fr') return res.redirect('/envoye');
  if (lang === 'eng') return res.redirect('/sent');
  res.redirect('/');
});

// -----------------------------
// 6️⃣ 404 fallback
// -----------------------------
app.use((req, res) => res.status(404).send('404: Not Found'));

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
