import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
createApp({ dataFile: process.env.DATA_FILE }).listen(port, () => {
  console.log(`api listening on http://127.0.0.1:${port}`);
});
