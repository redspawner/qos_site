// server.js
require('dotenv').config(); // optional for local dev (.env). Safe to keep; Railway ignores .env in repo.
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// helper to serve static and set mp4 mime
const serveStaticWithMP4 = (urlPath, folderPath) => {
  app.use(urlPath, express.static(path.join(__dirname, folderPath), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
    }
  }));
};

serveStaticWithMP4('/', '.');
serveStaticWithMP4('/fr', 'fr');
serveStaticWithMP4('/eng', 'eng');
serveStaticWithMP4('/pt', 'pt');
serveStaticWithMP4('/images', 'images');

// Nodemailer transporter using env vars (do NOT hardcode creds)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true', // set to "true" if using 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // optional: rejectUnauthorized false only if you know what you're doing
});

// Simple pages
app.get('/',       (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/pt.html',(req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/fr.html',(req, res) => res.sendFile(path.join(__dirname, 'fr.html')));
app.get('/eng.html',(req, res) => res.sendFile(path.join(__dirname, 'eng.html')));

// Form handler
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;
  console.log('Received submission:', { lang, name, email: email ? '[redacted]' : '', message: message ? '[redacted]' : '' });

  const now = new Date();
  const options = { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const localTimestamp = now.toLocaleString('en-GB', options);

  // Append sanitized log (no secrets)
  const logLine = `${localTimestamp} — [${lang}] ${name} <${email}>: ${message}\n`;
  fs.appendFile(path.join(__dirname, 'submissions.txt'), logLine, err => {
    if (err) console.error('Error writing submissions.txt:', err);
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.NOTIFY_TO || 'marioguerrabento@gmail.com, quintaouteirodaserva@gmail.com',
    subject: `New message from site (${(lang || '').toUpperCase()})`,
    text: `Recebeste uma nova mensagem (lingua=${lang}):\n\nNome: ${name}\nEmail: ${email}\nMensagem:\n${message}\n`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId || info.response);
  } catch (err) {
    console.error('❌ Email send error:', err && err.message ? err.message : err);
    // don't reveal details to user — just proceed with redirect
  }

  // Redirect based on language
  if (lang === 'pt') return res.redirect('/enviado.html');
  if (lang === 'fr') return res.redirect('/envoye.html');
  if (lang === 'eng') return res.redirect('/sent.html');
  return res.redirect('/pt.html');
});

// 404
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT} (port ${PORT})`));
