require('dotenv').config(); // load .env locally
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 8080; // single declaration

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files and mp4s
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

// Nodemailer transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Simple pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/pt.html', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/fr.html', (req, res) => res.sendFile(path.join(__dirname, 'fr.html')));
app.get('/eng.html', (req, res) => res.sendFile(path.join(__dirname, 'eng.html')));

// Form handler
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;
  console.log('Received submission:', { lang, name, email: email ? '[redacted]' : '', message: message ? '[redacted]' : '' });

  const now = new Date();
  const options = { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const localTimestamp = now.toLocaleString('en-GB', options);

  // Save to submissions.txt
  const logLine = `${localTimestamp} — [${lang}] ${name} <${email}>: ${message}\n`;
  fs.appendFile(path.join(__dirname, 'submissions.txt'), logLine, err => {
    if (err) console.error('Error writing submissions.txt:', err);
  });

  // Email options
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.NOTIFY_TO,
    subject: `New message from site (${lang.toUpperCase()})`,
    text: `Recebeste uma nova mensagem (lingua=${lang}):\n\nNome: ${name}\nEmail: ${email}\nMensagem:\n${message}\n`
  };

  // Send email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId || info.response);
  } catch (err) {
    console.error('❌ Email send error:', err);
  }

  // Redirect based on language
  if (lang === 'pt') return res.redirect('/enviado.html');
  if (lang === 'fr') return res.redirect('/envoye.html');
  if (lang === 'eng') return res.redirect('/sent.html');
  return res.redirect('/pt.html');
});

// 404
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
