import { createClient } from "redis";
import { config } from "../config.js";

export async function connectDatabase() {
  const database = createClient({
    socket: { host: config.REDIS_HOST, port: config.REDIS_PORT },
  });

  database.on("error", (err) => {
    console.error("Erro do Redis:", err);
  });

  await database.connect();
  console.log("Conectado ao Redis!");

  if (config.RESET_DB_ON_START) {
    await database.flushDb();
  }

  return database;
}
