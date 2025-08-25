// Vercel Serverless Function: /api/lead
const nodemailer = require('nodemailer');

function toCsvLine(values) {
  return values.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}
function buildCsv(payload) {
  const { name, company, email, profile, answers = {} } = payload || {};
  const headers = ['timestamp','name','company','email','profile','q1','q2','q3','q4'];
  const row = [
    new Date().toISOString(),
    name ?? '', company ?? '', email ?? '', profile ?? '',
    answers['q1_invest'] ?? '', answers['q2_gtm'] ?? '',
    answers['q3_ratings'] ?? '', answers['q4_growth'] ?? '',
  ];
  return `${headers.join(',')}\n${toCsvLine(row)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const { name, company, email, profile, answers } = req.body || {};
  if (!name || !company || !email) {
    res.status(400).json({ ok:false, error:'Missing required fields' }); return;
  }

  const csv = buildCsv({ name, company, email, profile, answers });
  const subject = 'PUR-Report Anfrage (CSV)';
  const bodyText =
`Untenstehend die CSV-Daten (Header + Zeile) für Zapier-Parsing:

${csv}

-- Ende CSV --
`;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"PUR Lead" <${process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO || process.env.SMTP_USER,
      subject,
      text: bodyText,                                      // CSV im Body (für Zapier-Formatter)
      attachments: [{ filename: `pur_lead_${Date.now()}.csv`, content: csv }], // optional zusätzlich als Anhang
    });

    res.status(200).json({ ok:true });
  } catch (err) {
    console.error('Mail send failed:', err?.message || err);
    res.status(500).json({ ok:false, error:'Mail send failed' });
  }
};
