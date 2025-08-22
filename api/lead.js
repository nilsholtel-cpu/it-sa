// Vercel Serverless Function: /api/lead
const nodemailer = require('nodemailer');

function allowCors(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  allowCors(res, process.env.CORS_ORIGIN || '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, company, email, answers } = req.body || {};
    if (!name || !company || !email) return res.status(400).json({ error: 'Missing required fields' });
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return res.status(400).json({ error: 'Invalid email' });

    // SMTP Transport (z. B. Microsoft 365)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { ciphers: 'TLSv1.2' }
    });

    const TO = process.env.TO_EMAIL || 'nils.holtel@techconsult.de';
    const FROM = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const BCC = process.env.CRM_BCC || ''; // optional CRM-BCC

    const lines = [
      'Neue Anfrage für individuellen Report:',
      '',
      `Name: ${name}`,
      `Unternehmen: ${company}`,
      `Geschäftliche E-Mail: ${email}`,
      '',
      '--- Antworten ---',
      ...Object.entries(answers || {}).map(([k, v]) => `${k}: ${v}`)
    ];

    await transporter.sendMail({
      from: FROM,
      to: TO,
      bcc: BCC || undefined,
      replyTo: email,
      subject: 'Neue Report-Anfrage (Landingpage)',
      text: lines.join('\n')
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[lead] error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
