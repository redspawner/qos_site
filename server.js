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

// Redirect .html → clean path
app.use((req, res, next) => {
  if (req.url.endsWith('.html')) {
    return res.redirect(301, req.url.slice(0, -5));
  }
  next();
});

// Serve clean URLs by mapping /page → page.html
app.get('/:page', (req, res, next) => {
  const filePath = path.join(__dirname, `${req.params.page}.html`);
  fs.access(filePath, fs.constants.F_OK, err => {
    if (err) return next(); // not found → move on
    res.sendFile(filePath);
  });
});

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

// Root → pt.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));

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
  res.redirect('/pt');
});

// 404
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start server
app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`)
);
