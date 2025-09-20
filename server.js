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

// Serve static files
app.use(express.static(__dirname));
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

  return gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
}

// Redirect only root HTML pages to extensionless
const rootHtmlPages = ['pt.html', 'fr.html', 'eng.html', 'enviado.html', 'sent.html', 'envoye.html'];
app.use((req, res, next) => {
  const name = req.path.slice(1); // remove leading /
  if (rootHtmlPages.includes(name)) {
    const clean = name.replace('.html', '');
    return res.redirect(301, clean === 'pt' ? '/' : `/${clean}`);
  }
  next();
});

// Serve HTML files without extension
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/images') || req.path.includes('.')) return next();

  let filePath;

  // Root page
  if (req.path === '/' || req.path === '') {
    filePath = path.join(__dirname, 'pt.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }

  // Form confirmation pages
  const formPages = ['enviado', 'sent', 'envoye'];
  if (formPages.includes(req.path.replace('/', ''))) {
    filePath = path.join(__dirname, `${req.path}.html`);
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }

  // Root folder pages (like /pt.html after redirect)
  filePath = path.join(__dirname, `${req.path}.html`);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);

  // Language folder pages
  const parts = req.path.split('/').filter(Boolean); // remove empty
  if (parts.length >= 2) {
    filePath = path.join(__dirname, parts[0], `${parts.slice(1).join('/')}.html`);
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }

  // Try folder index.html fallback
  filePath = path.join(__dirname, req.path, 'index.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);

  return next();
});

// Form handler
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;
  console.log('Received submission:', {
    lang,
    name,
    email: email ? '[redacted]' : '',
    message: message ? '[redacted]' : ''
  });

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
      console.log(`📧 Email sent to ${to}`);
    }
  } catch (err) {
    console.error('❌ Gmail API send error:', err);
  }

  if (lang === 'pt') return res.redirect('/enviado');
  if (lang === 'fr') return res.redirect('/envoye');
  if (lang === 'eng') return res.redirect('/sent');
  res.redirect('/');
});

// 404 fallback
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
