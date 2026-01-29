import { Router } from 'express';
import { getMe } from '../controllers/userController';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
router.get('/me', getMe);
export default router;
