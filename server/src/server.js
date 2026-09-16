import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8080);

const server = createApp();

server.listen(port, () => {
  console.log(`Soundwave API listening on http://localhost:${port}`);
});