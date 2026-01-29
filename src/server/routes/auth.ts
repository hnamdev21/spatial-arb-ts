import { Router } from 'express';
import { getDiscord, getDiscordCallback } from '../controllers/auth';

const router = Router();
router.get('/discord', getDiscord);
router.get('/discord/callback', getDiscordCallback);
export default router;
