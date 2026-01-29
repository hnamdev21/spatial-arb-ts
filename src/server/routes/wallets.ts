import { Router } from 'express';
import { createWithAuth, listWithAuth } from '../controllers/wallet';

const router = Router();
router.post('/', createWithAuth);
router.get('/', listWithAuth);
export default router;
