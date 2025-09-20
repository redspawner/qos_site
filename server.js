require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
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

// Nodemailer transporter
async function createTransporter() {
const { token } = await oAuth2Client.getAccessToken();
if (!token) throw new Error('Failed to retrieve access token');

  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.OAUTH_USER_EMAIL,
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      refreshToken: process.env.OAUTH_REFRESH_TOKEN,
      accessToken: accessToken.token
    }
  });
}

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/pt.html', (req, res) => res.sendFile(path.join(__dirname, 'pt.html')));
app.get('/fr.html', (req, res) => res.sendFile(path.join(__dirname, 'fr.html')));
app.get('/eng.html', (req, res) => res.sendFile(path.join(__dirname, 'eng.html')));

// Form handler
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;
  console.log('Received submission:', { lang, name, email: email ? '[redacted]' : '', message: message ? '[redacted]' : '' });

  const now = new Date();
  const logLine = `${now.toISOString()} — [${lang}] ${name} <${email}>: ${message}\n`;
  fs.appendFile(path.join(__dirname, 'submissions.txt'), logLine, err => { if (err) console.error(err); });

  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.NOTIFY_TO,
      subject: `New message from site (${lang.toUpperCase()})`,
      text: `Recebeste uma nova mensagem (lingua=${lang}):\n\nNome: ${name}\nEmail: ${email}\nMensagem:\n${message}`
    });
    console.log('📧 Email sent successfully!');
  } catch (err) {
    console.error('❌ Email send error:', err);
  }

  if (lang === 'pt') return res.redirect('/enviado.html');
  if (lang === 'fr') return res.redirect('/envoye.html');
  if (lang === 'eng') return res.redirect('/sent.html');
  res.redirect('/pt.html');
});

// 404
app.use((req, res) => res.status(404).send('404: Not Found'));

// Start server
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running at http://0.0.0.0:${PORT}`));
