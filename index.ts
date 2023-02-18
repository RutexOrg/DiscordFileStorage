import dotenv from "dotenv";
import config from "./config";
import {  GatewayIntentBits } from "discord.js";
import color from "colors/safe";
import DiscordFileStorageApp, { printAndExit } from "./src/DiscordFileStorageApp";
import WebdavFilesystemHandler from "./src/webdav/WebdavFilesystemHandler";
import { v2 as webdav } from "webdav-server";
import WebdavServer from "./src/webdav/WebdavServer";

async function main() {
    dotenv.config();

    const token = process.env.TOKEN;
    const guildId = process.env.GUILD_ID;

    if (!token) {
        printAndExit("No token provided. Please set the TOKEN .env variable to your bot token.");
    }

    if (!guildId) {
        printAndExit("No guild id provided. Please set the GUILD_ID .env variable to your guild id.");
    }

    const app = new DiscordFileStorageApp({
        intents: [
            GatewayIntentBits.MessageContent,
        ]
    }, guildId!);

    console.log(color.yellow("Logging in..."));
    await app.login(token!);
    await app.waitForReady();
    await app.prepare();

    console.log(color.yellow("Fetching files..."));
    await app.loadFilesToCache();



    if (config.startWebdavServer) {
        const webdavServer = new WebdavServer({
            port: config.webdavPort,
            rootFileSystem: new WebdavFilesystemHandler(app),
            hostname: "0.0.0.0",
        });

        webdavServer.start(() => {
            console.log(color.green("WebDAV server started"));
        });
        
        webdavServer.afterRequest((arg, next) => {
            // Display the method, the URI, the returned status code and the returned message
            console.log('>>', arg.request.method, arg.requested.uri, '>', arg.response.statusCode, arg.response.statusMessage);
            // If available, display the body of the response
            console.log(arg.responseBody);
            next();
        });
    }

}

process.on("uncaughtException", (err) => {
    console.log(color.red("Uncaught exception"));
    console.log(color.red(err.name));
    console.log(color.red(err.message));
    console.log(color.red(err.stack!));
});

main();