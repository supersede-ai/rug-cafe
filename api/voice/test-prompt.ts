// Test endpoint to verify Prompt ID configuration
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const promptId = process.env.VITE_VOICE_PROMPT_ID?.trim();
  
  res.status(200).json({
    promptId: promptId ? `${promptId.slice(0, 15)}...` : 'NOT_CONFIGURED',
    hasPromptId: !!promptId,
    timestamp: new Date().toISOString(),
    message: promptId ? 'Prompt ID is configured' : 'Prompt ID is missing - using fallback'
  });
}