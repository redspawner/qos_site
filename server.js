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

// --- Redirect .html -> clean path (only if file exists) ---
// This middleware must run BEFORE static serving so we actually redirect.
app.use((req, res, next) => {
  // only handle direct requests for .html files
  if (!req.path.endsWith('.html')) return next();

  // build absolute path to file
  const filePath = path.join(__dirname, req.path);

  // if the file exists, redirect to clean URL
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (!err) {
      // remove trailing ".html" and redirect
      const clean = req.path.slice(0, -5) || '/';
      return res.redirect(301, clean);
    }
    // else, file doesn't exist — fall through (404 or other handlers)
    next();
  });
});

// --- Serve only asset folders as static (do NOT serve whole __dirname here) ---
// This avoids express.static serving HTML files before the redirect runs.
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
// add other static folders you use (fonts, etc.)

// --- Serve root index explicitly ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));

// --- Serve clean URLs: /page -> page.html if exists ---
app.get('/:page', (req, res, next) => {
  const page = req.params.page;

  // Prevent matching assets or special routes you may add later
  const blacklisted = ['assets', 'images', 'js', 'css', 'submit-form', 'favicon.ico'];
  if (blacklisted.includes(page)) return next();

  const filePath = path.join(__dirname, `${page}.html`);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return next(); // file not found -> next (eventually 404)
    return res.sendFile(filePath);
  });
});


// ----------------- Gmail / form code (unchanged) -----------------
const oAuth2Client = new google.auth.OAuth2(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

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

// 404 fallback
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running at http://0.0.0.0:${PORT}`));
