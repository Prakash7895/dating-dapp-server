import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { initializeWeb3Socket } from './web3Socket';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Start the server
app.listen(process.env.PORT, async () => {
  console.log(`Server is running on http://localhost:${process.env.PORT}`);
  await initializeWeb3Socket();
  console.log('WebSocket connection initialized FINALLLL');
});
