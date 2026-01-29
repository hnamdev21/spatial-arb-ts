import { Router } from 'express';
import { createWithAuth, listWithAuth } from '../controllers/walletController';

const router = Router();
router.post('/', createWithAuth);
router.get('/', listWithAuth);
export default router;
