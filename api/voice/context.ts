// Optional: Return additional context for the assistant.
// You can enrich this later to read from a CMS or database.

export const config = { runtime: 'nodejs20.x' } as const;

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Minimal stub – extend as needed
  res.status(200).json({
    status: 'ok',
    version: 1,
    message: 'Add canonical hours/menu here if desired',
  });
}
