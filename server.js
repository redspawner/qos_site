require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const favicon = require('serve-favicon'); // 👈 added

const app = express();
const PORT = process.env.PORT || 8080;

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Favicon middleware
app.use(favicon(path.join(__dirname, 'images', 'favicon.svg'))); // 👈 serve favicon.svg

// Serve static files
app.use(express.static(__dirname));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/eng', express.static(__dirname));
app.use('/pt', express.static(__dirname));
app.use('/fr', express.static(__dirname));

// OAuth2 setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

// Gmail API email sender
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

// Explicit page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/pt.html', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/fr.html', (req, res) => res.sendFile(path.join(__dirname, 'fr.html')));
app.get('/eng.html', (req, res) => res.sendFile(path.join(__dirname, 'eng.html')));

// Form handler
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;

  const logLine = `${new Date().toISOString()} — [${lang}] ${name} <${email}>: ${message}\n`;
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
  } catch {
    // fail silently
  }

  if (lang === 'pt') return res.redirect('/enviado');
  if (lang === 'fr') return res.redirect('/envoye');
  if (lang === 'eng') return res.redirect('/sent');
  res.redirect('/pt.html');
});

// Catch-all HTML fallback (silent, minimal)
app.use((req, res, next) => {
  const reqPathDecoded = decodeURIComponent(req.path || '');
  const relRequested = reqPathDecoded.replace(/^\/+|\/+$/g, '') || 'pt';
  const candidates = [
    path.join(__dirname, relRequested + '.html'),
    path.join(__dirname, relRequested, 'index.html')
  ];

  let tried = 0;
  const tryNext = () => {
    if (tried >= candidates.length) return next();
    const candidate = candidates[tried++]; 
    fs.access(candidate, fs.constants.R_OK, (err) => {
      if (err) return tryNext();
      res.sendFile(candidate);
    });
  };
  tryNext();
});

// 404
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start server
app.listen(PORT, '0.0.0.0');
