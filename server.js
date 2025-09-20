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

// Redirect .html URLs to extensionless (only if the file exists)
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath)) {
      // /index.html → folder
      if (req.path.endsWith('/index.html')) {
        return res.redirect(301, req.path.replace(/index\.html$/, ''));
      }
      // other .html → remove extension
      return res.redirect(301, req.path.slice(0, -5));
    }
  }
  next();
});

// Serve HTML files without extension, including folder index.html
app.get(/.*/, (req, res, next) => {
  // Skip static assets
  if (
    req.path.startsWith('/images') ||
    req.path.includes('.') // other files
  ) return next();

  // Default root page
  if (req.path === '/' || req.path === '') {
    const rootFile = path.join(__dirname, 'pt.html');
    if (fs.existsSync(rootFile)) return res.sendFile(rootFile);
  }

  // Try direct file
  let filePath = path.join(__dirname, `${req.path}.html`);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);

  // Try folder index
  filePath = path.join(__dirname, req.path, 'index.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);

  // Not found
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

  // Log submissions
  const logLine = `${new Date().toISOString()} — [${lang}] ${name} <${email}>: ${message}\n`;
  fs.appendFile(path.join(__dirname, 'submissions.txt'), logLine, err => {
    if (err) console.error('❌ Error writing submissions.txt:', err);
  });

  // Send emails
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

  // Redirect after form
  if (lang === 'pt') return res.redirect('/pt/enviado');
  if (lang === 'fr') return res.redirect('/fr/envoye');
  if (lang === 'eng') return res.redirect('/eng/sent');
  res.redirect('/');
});

// 404 fallback
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
