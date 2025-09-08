// Vercel Serverless Function: Create a booking for The Rug Café

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const {
      date,
      time,
      partySize,
      name,
      email,
      phone,
      specialRequests,
    } = (await parseJson(req)) as any;

    const errors: string[] = [];
    if (!date) errors.push('date');
    if (!time) errors.push('time');
    if (!partySize) errors.push('partySize');
    if (!name) errors.push('name');
    if (!email && !phone) errors.push('email_or_phone');
    if (errors.length) {
      res.status(400).json({ error: 'missing_fields', fields: errors });
      return;
    }

    const [hhStr] = String(time).split(':');
    const hh = Number(hhStr);
    if (Number.isFinite(hh) && (hh < 8 || hh >= 18)) {
      res.status(409).json({ error: 'outside_business_hours' });
      return;
    }

    const bookingId = `rug_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    res.status(200).json({
      bookingId,
      status: 'confirmed',
      venue: 'The Rug Café',
      date,
      time,
      partySize,
      name,
      email: email || null,
      phone: phone || null,
      specialRequests: specialRequests || null,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'invalid_json', details: String(err) });
  }
}

async function parseJson(req: any) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
  } catch {}
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c: any) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

