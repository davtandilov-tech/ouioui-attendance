import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { webhookCallback } from "grammy";
import { bot } from "./bot.js";
import { config } from "./config.js";
import { router } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappDist = path.join(__dirname, "../../webapp/dist");

// Секрет генерируется заново при каждом старте и тут же прописывается в setWebhook —
// это переживает "засыпание"/рестарт на бесплатных хостингах вроде Render без внешнего состояния.
const webhookSecret = crypto.randomBytes(32).toString("hex");
const webhookPath = "/telegram/webhook";

const app = express();
app.use(express.json());
app.use(webhookPath, webhookCallback(bot, "express", { secretToken: webhookSecret }));
app.use("/api", router);
app.use(express.static(webappDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(webappDist, "index.html"));
});

app.listen(config.port, async () => {
  console.log(`Сервер запущен на порту ${config.port}`);

  try {
    await bot.init();
    await bot.api.setWebhook(`${config.publicUrl}${webhookPath}`, { secret_token: webhookSecret });
    await bot.api.setChatMenuButton({
      menu_button: { type: "web_app", text: "Открыть", web_app: { url: config.publicUrl } },
    });
  } catch (err) {
    console.error("Не удалось инициализировать бота (API-сервер продолжает работать):", err);
  }
});
