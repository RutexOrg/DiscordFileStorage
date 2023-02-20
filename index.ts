import dotenv from "dotenv";
import config from "./config";
import {  GatewayIntentBits } from "discord.js";
import color from "colors/safe";
import DiscordFileStorageApp, { printAndExit } from "./src/DiscordFileStorageApp";
import WebdavFilesystemHandler from "./src/webdav/WebdavFilesystemHandler";
import { v2 as webdav } from "webdav-server";
import WebdavServer from "./src/webdav/WebdavServer";
import fs from "node:fs";

async function main() {
    dotenv.config();
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 as any; // TODO: test this

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

    await app.loadFilesToCache();



    if (config.startWebdavServer) {
        const serverLaunchOptions: webdav.WebDAVServerOptions = {
            port: config.webdavPort,
            rootFileSystem: new WebdavFilesystemHandler(app),
        }

        if(process.env.ENABLE_HTTPS){
            console.log("Detected ENABLE_HTTPS env variable. Starting webdav server with https enabled.");
            
            // generate self-signed certificate: openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out cert.pem -days 365 -nodes
            checkIfFileExists("./certs/cert.pem", "Please set ssl ./certs/cert.pem or generate a self-signed certificate");
            checkIfFileExists("./certs/privKey.pem", "Please set ssl ./certs/privKey.pem or generate a self-signed certificate");
            checkIfFileExists("./certs/chain.pem", "Please set ssl ./certs/chain.pem or generate a self-signed certificate");

            serverLaunchOptions.https = {
                key: readFile("./certs/privkey.pem"),
                cert: readFile("./certs/cert.pem"),
                ca: readFile("./certs/chain.pem"),
            }
        }
        
        const webdavServer = new WebdavServer(serverLaunchOptions);

        await webdavServer.startAsync(config.webdavPort);
        console.log(color.green("WebDAV server started at port " + config.webdavPort + "."));

        webdavServer.beforeRequest((arg, next) => {
            let pathInfo = arg.requested.path;
            if(pathInfo.paths[0] === "get"){
                console.log("wtf");
            }

            next();
        });

        webdavServer.afterRequest((arg, next) => {
            // Display the method, the URI, the returned status code and the returned message
            // console.log('>>', arg.request.method, arg.requested.uri, '>', arg.response.statusCode, arg.response.statusMessage);
            // If available, display the body of the response
            // console.log(arg.responseBody);
            next();
        });
    }

}

function checkIfFileExists(path: string, assertString: string = ""): boolean  {
    if(!fs.statSync(path).isFile()){
        throw new Error("File "+ path +" is not found" + (assertString.length > 0 ? ": " + assertString : "" ));
    }
    return true;
}

function readFile(path: string): Buffer {
    return fs.readFileSync(path);
}

process.on("uncaughtException", (err) => {
    console.log(color.red("Uncaught exception"));
    console.log(color.red(err.name));
    console.log(color.red(err.message));
    console.log(color.red(err.stack!));
});

main();