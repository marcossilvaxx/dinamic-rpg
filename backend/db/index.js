import redis from "redis";
import env from "../env.json" assert { type: "json" };

export const database = redis.createClient({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

database.on("connect", () => {
  console.log("Conectado ao Redis!");

  database.flushDb();
});

database.on("error", (err) => {
  console.log("Erro do Redis: " + err);
});

database.connect();
