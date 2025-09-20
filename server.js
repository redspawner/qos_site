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

  return gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage }
  });
}

// Redirect .html URLs → extensionless
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath)) {
      const clean = req.path.slice(0, -5); // remove .html
      return res.redirect(301, clean || '/');
    }
  }
  next();
});

// Serve HTML files without extension
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/images') || req.path.includes('.')) {
    return next(); // skip static assets or requests with extension
  }

  const parts = req.path.split('/').filter(Boolean); // remove empty parts
  let filePath;

  if (parts.length === 0) {
    filePath = path.join(__dirname, 'pt.html'); // default root
  } else if (['pt', 'eng', 'fr'].includes(parts[0])) {
    // language folder mapping
    filePath = path.join(__dirname, parts[0], parts.slice(1).join('/') + '.html');
  } else {
    // root HTMLs
    filePath = path.join(__dirname, parts.join('/') + '.html');
  }

  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return next();
});

// Form handler
app.post('/submit-form', async (req, res) => {
  const { lang = 'pt', name = '', email = '', message = '' } = req.body;
  console.log('Received submission:'
