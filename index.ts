import dotenv from "dotenv";
import { ChannelType, GatewayIntentBits } from "discord.js";
import color from "colors/safe";
import DiscordFileStorageApp, { printAndExit } from "./src/DiscordFileStorageApp";
import { v2 as webdav } from "webdav-server";
import WebdavFileSystem from "./src/webdav/WebdavFileSystem";
import ClientFile from "./src/file/ClientFile";
import ServerFile from "./src/file/ServerFile";
import VirtualDiscordFileSystem from "./src/webdav/WebdavFileSystem";

// https://discord.com/oauth2/authorize?client_id=1074020035716202506&permissions=8&scope=bot%20applications.commands

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
            GatewayIntentBits.Guilds,
            GatewayIntentBits.MessageContent,
        ]
    }, guildId!);


    app.once("ready", () => {
        console.log(color.green("Ready"));
    });

    console.log(color.yellow("Logging in..."));
    await app.login(token);
    await app.prepare();

    console.log(color.yellow("Fetching files..."));
    await app.loadFilesToCache();


    const startWebdavServer = true;

    if (startWebdavServer) {
        const webdavServer = new webdav.WebDAVServer({
            port: 1900,
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

    // for(let file of app.getFiles()){
    //     await app.deleteFile(file);
    // }

    // const sampleUploadFile = ClientFile.fromLocalPath("c:\\users\\david\\Desktop\\Relationen.pdf");
    // let uploadTest = (await app.uploadFile(sampleUploadFile));
    // if(uploadTest.success){
    //     console.log(color.green("File uploaded successfully"));
    // }else{
    //     console.log(color.red("Failed to upload file"));
    // }

    // // (TODO: auto cache)
    // console.log(color.yellow("Updating files cache and sleeping 5 sec..."));
    // await client.loadFilesToCache();
    // await client.sleep(5000);


    // let file = client.getFiles()[0];
    // file.setLocalFilePath("c:\\users\\david\\Desktop\\test\\download-" + file.getFileName());
    // await client.downloadFile(file, fs.createWriteStream("c:\\users\\david\\Desktop\\test\\download111.mp4"));
    // console.log(color.green("Done"));    

}

process.on("uncaughtException", (err) => {
    console.log(color.red("Uncaught exception"));
    console.log(color.red(err.name));
    console.log(color.red(err.message));
    console.log(color.red(err.stack!));

});

main();