import dotenv from "dotenv";
import {  GatewayIntentBits } from "discord.js";
import color from "colors/safe";
import DiscordFileStorageApp, { printAndExit } from "./src/DiscordFileStorageApp";
import WebdavFilesystemHandler from "./src/webdav/WebdavFilesystemHandler";
import { v2 as webdav } from "webdav-server";
import WebdavServer from "./src/webdav/WebdavServer";
import fs from "node:fs";
import root from "app-root-path";
 
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 as any;
//Without it throws error: cause: Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames: Host: localhost. is not in the cert's altnames: DNS: ***
// Idk how to fix it now, so let it be just disabled.

async function main() {
    dotenv.config();
    const token = checkEnvVariableIsset("TOKEN", "Please set the TOKEN to your bot token.");
    const guildId = checkEnvVariableIsset("GUILD_ID", "Please set the GUILD_ID to your guild id.");
    const startWebdavServer = checkEnvVariableIsset<boolean>("START_WEBDAV", "Please set the START_WEBDAV to true or false to start webdav server.");
    const webdavPort = checkEnvVariableIsset<number>("PORT", "Please set the PORT to your webdav server port.");
    const filesChannelName = checkEnvVariableIsset("FILES_CHANNEL", "Please set the FILES_CHANNEL to your files channel name.");
    const metaChannelName = checkEnvVariableIsset("META_CHANNEL", "Please set the META_CHANNEL to your meta channel name.");
    const enableHttps = checkEnvVariableIsset<boolean>("ENABLE_HTTPS", "Please set the ENABLE_HTTPS to true or false to enable https.");

    const app = new DiscordFileStorageApp({
        intents: [
            GatewayIntentBits.MessageContent,
        ],
        filesChannelName: filesChannelName,
        metaChannelName: metaChannelName,
    }, guildId!);

    console.log(color.yellow("Logging in..."));
    await app.login(token!);
    await app.waitForReady();
    await app.prepare();
    await app.loadFilesToCache();

    if (startWebdavServer) {
        const serverLaunchOptions: webdav.WebDAVServerOptions = {
            port: webdavPort,
            rootFileSystem: new WebdavFilesystemHandler(app),
        }

        if(enableHttps){
            console.log("Detected ENABLE_HTTPS env variable. Starting webdav server with https enabled.");
            
            // generate self-signed certificate: openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out cert.pem -days 365 -nodes
            checkIfFileExists(root.resolve("/certs/privkey.pem"), false, "Please set ssl ./certs/privKey.pem or generate a self-signed certificate");
            checkIfFileExists(root.resolve("/certs/cert.pem"), false, "Please set ssl ./certs/cert.pem or generate a self-signed certificate");
            checkIfFileExists(root.resolve("/certs/chain.pem"), true, "Please set ssl ./certs/chain.pem or generate a self-signed certificate");

            serverLaunchOptions.https = {
                key: readFileSyncOrUndefined(root.resolve("/certs/privkey.pem")),
                cert: readFileSyncOrUndefined(root.resolve("/certs/cert.pem")),
                ca: readFileSyncOrUndefined(root.resolve("/certs/chain.pem")),
            }
        }else{
            process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 as any; // in case if we started the server without https on machine with any bounded domain name and https cert, enabled cert verification will fail in some cases. so we disable this check.
        }
        
        const webdavServer = new WebdavServer(serverLaunchOptions);

        await webdavServer.startAsync(webdavPort);
        console.log(color.green("WebDAV server started at port " + webdavPort + "."));

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

function checkIfFileExists(path: string, soft: boolean, assertString: string = ""): boolean  {
    try{
        if(!fs.statSync(path).isFile()){
            const string = "File "+ path +" is not found" + (assertString.length > 0 ? ": " + assertString : "" );
            if(!soft){
                throw new Error(string);
            }
            console.warn(string);
            return false;
        }
    }catch(e){
        return false;
    }
    return true;
}

function checkEnvVariableIsset<T = string>(name: string, assertString: string): T {
    const value = process.env[name];
    if(!value){
        printAndExit("Env variable "+ name +" is not set" + (assertString.length > 0 ? ": " + assertString : "" ) + ". Please set it in .env file or in your system environment variables.");
    };
    return value as unknown as T;
}

function readFileSyncOrUndefined(path: string): string | undefined {
    try {
        let file = fs.readFileSync(path);
        return file.toString();
    } catch (error) {
        return undefined;
    }
}



process.on("uncaughtException", (err) => {
    console.log(color.red("Uncaught exception"));
    console.log(color.red(err.name));
    console.log(color.red(err.message));
    console.log(color.red(err.stack!));
});

main();