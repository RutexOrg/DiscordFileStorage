import config from "./src/config";
import dotenv from "dotenv";
import {  GatewayIntentBits } from "discord.js";
import color from "colors/safe";
import DiscordFileStorageApp, { printAndExit } from "./src/DiscordFileStorageApp";
import VirtualDiscordFileSystem from "./src/webdav/WebdavFileSystem";
import { v2 as webdav } from "webdav-server";

async function main() {
    dotenv.config();

    const token = process.env.BTOKEN;
    const guildId = process.env.GUILD_ID;
    const metaChannelName = process.env.META_CHANNEL;
    const filesChannelName = process.env.FILES_CHANNEL;

    if (!token) {
        printAndExit("No token provided. Please set the TOKEN .env variable to your bot token.");
    }

    if (!guildId) {
        printAndExit("No guild id provided. Please set the GUILD_ID .env variable to your guild id.");
    }

    if (!metaChannelName) {
        printAndExit("No meta channel name provided. Please set the META_CHANNEL .env variable to your metadata channel name.");
    }

    if (!filesChannelName) {
        printAndExit("No files channel name provided. Please set the FILES_CHANNEL .env variable to your files channel name.");
    }

    const app = new DiscordFileStorageApp({
        intents: [
            GatewayIntentBits.MessageContent,
        ]
    }, guildId!);

    console.log(color.yellow("Logging in..."));
    await app.login(token);
    await app.waitForReady();
    await app.prepare();

    console.log(color.yellow("Fetching files..."));
    await app.loadFilesToCache();



    if (config.startWebDavServer) {
        const webdavServer = new webdav.WebDAVServer({
            port: config.webdavPort,
            rootFileSystem: new VirtualDiscordFileSystem(app),
        });

        await webdavServer.start(() => {
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