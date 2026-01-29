import express from 'express';
import passport from './passport';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import walletsRouter from './routes/wallets';

const app = express();

app.use(express.json());
app.use(passport.initialize());

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/wallets', walletsRouter);

export default app;
