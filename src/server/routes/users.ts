import { Router } from 'express';
import { getMe } from '../controllers/user';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
router.get('/me', getMe);
export default router;
