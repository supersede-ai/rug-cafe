// Vercel Serverless Function: List bookings
// For production, back this with a database. In local dev, the Node server at :8787 persists to disk
// and should be accessed via Vite proxy.

export default async function handler(_req: any, res: any) {
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (_req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  res.status(501).json({
    error: 'not_implemented',
    message: 'Listing bookings is only implemented in the local dev server. In production, configure a database and implement this route.',
  });
}

