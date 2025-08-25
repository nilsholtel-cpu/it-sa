// api/lead.js
// Benötigt: npm i nodemailer  (package.json dependency)

const nodemailer = require('nodemailer');

// ===== Helpers: CSV =====
function toCsvLine(values) {
  return values.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}
function buildCsv(payload) {
  const { name, company, email, profile, answers = {} } = payload || {};
  const headers = ['timestamp','name','company','email','profile','q1','q2','q3','q4'];
  const row = [
    new Date().toISOString(),
    name ?? '',
    company ?? '',
    email ?? '',
    profile ?? '',
    answers['q1_invest'] ?? '',
    answers['q2_gtm'] ?? '',
    answers['q3_ratings'] ?? '',
    answers['q4_growth'] ?? '',
  ];
  return `${headers.join(',')}\n${toCsvLine(row)}`;
}

// ===== Mail (Outlook/SMTP) =====
async function sendMailCSV(csv) {
  const host = process.env.SMTP_HOST || 'smtp.office365.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to   = process.env.MAIL_TO || user;

  if (!user || !pass) throw new Error('SMTP credentials missing');

  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
  });

  // Body = nur CSV (damit Zapier/Regeln leicht parsen können) + Anhang
  await transporter.sendMail({
    from: `"PUR Lead" <${user}>`,
    to,
    subject: 'PUR-Report Anfrage (CSV)',
    text: csv,
    attachments: [{ filename: `pur_lead_${Date.now()}.csv`, content: csv }],
  });

  return { ok: true };
}

// ===== Notion =====
// In Vercel setzen: NOTION_SECRET, NOTION_DB_ID
async function sendToNotion(payload) {
  const NOTION_SECRET = process.env.NOTION_SECRET;
  const NOTION_DB_ID  = process.env.NOTION_DB_ID;
  if (!NOTION_SECRET || !NOTION_DB_ID) throw new Error('Notion env vars missing');

  const { name } = payload || {};
  const body = {
    parent: { database_id: NOTION_DB_ID },
    properties: {
      // <- PASSE "Name" GENAU an die Titel-Spalte deiner DB an
      Name: { title: [{ text: { content: String(name || '').trim() || 'Unbekannt' } }] },
    },
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_SECRET}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Notion error: ${res.status} ${txt}`);
  return { ok: true };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  try {
    const { name, company, email } = req.body || {};
    if (!name || !company || !email) {
      return res.status(400).json({ ok:false, error:'Missing required fields (name, company, email)' });
    }

    const csv = buildCsv(req.body);

    // Beide Aktionen ausführen (parallel), Ergebnis zusammenfassen:
    const [mailR, notionR] = await Promise.allSettled([
      sendMailCSV(csv),
      sendToNotion(req.body),
    ]);

    const result = {
      ok: (mailR.status === 'fulfilled') && (notionR.status === 'fulfilled'),
      mail:  mailR.status  === 'fulfilled' ? mailR.value  : { ok:false, error: mailR.reason?.message || String(mailR.reason) },
      notion: notionR.status === 'fulfilled' ? notionR.value : { ok:false, error: notionR.reason?.message || String(notionR.reason) },
    };

    // Client sieht eine freundliche Antwort, auch wenn eine Seite mal hakt
    return res.status(result.ok ? 200 : 207).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, error: e?.message || 'Server error' });
  }
};
