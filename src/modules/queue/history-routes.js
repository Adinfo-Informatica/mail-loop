import { requireAdmin } from '../auth/auth.js';

// Install after authentication and CSRF middleware.
export function installHistoryRoutes(app, queue) {
  app.post('/api/history/clear', requireAdmin, (req, res) => {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirme a limpeza do histórico compartilhado.' });
    res.json({ deleted: queue.clearHistory() });
  });
}
