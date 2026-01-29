import express from 'express';
import { getHealth } from './routes/health';

const app = express();

app.use(express.json());

app.get('/health', getHealth);

export default app;
