import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs";
import root from "app-root-path";
import { GatewayIntentBits } from "discord.js";
import color from "colors/safe.js";
import FileStorageApp, { print, printAndExit } from "./src/DICloudApp.js";
import WebdavFilesystemHandler from "./src/webdav/WebdavFilesystemHandler.js";
import WebdavServer, { ServerOptions } from "./src/webdav/WebdavServer.js";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 as any;
//Without it throws error: cause: Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames: Host: localhost. is not in the cert's altnames: DNS: ***
// Idk how to fix it now, so let it be just disabled.


export interface IUserRecord {
    username: string;
    password: string;
}

export interface IBootParams {
    token: string;
    guildId: string;
    filesChannelName: string;
    metaChannelName: string;
    webdavPort: number;
    startWebdavServer: boolean;
    enableHttps: boolean;
    skipPreload: boolean;
    enableAuth: boolean;
    users: string;
    enableEncrypt: boolean;
    encryptPassword: string;
}

export interface IBootParamsParsed extends IBootParams {
    usersParsed: IUserRecord[];
}

function bootPrecheck(params: IBootParams): IBootParamsParsed {
    if (params.enableEncrypt && !params.encryptPassword) {
        printAndExit("Please set the ENCRYPT_PASSWORD to your encryption password.");
    }

    // regex: key:value,key:value,...
    if(params.enableAuth && !(/^(?:\w+:\w+,)*\w+:\w+$/i).test(params.users)){
        printAndExit("USERS env variable is not in correct format. Please use format username1:password1,username2:password2");
    }

    const usersParsed: IUserRecord[] = params.users.split(",").map((user) => {
        const [username, password] = user.split(":");
        return { username, password };
    });

    if (params.enableAuth && usersParsed.length == 0) {
        printAndExit("USERS env variable is empty. Please set at least one user.");
    }

    return {
        ...params,
        usersParsed,
    };
}


export async function boot(data: IBootParams){
    console.log(`NodeJS version: ${process.version}`);
    console.log(color.yellow("Starting DiscordFileStorage..."));
    const params = bootPrecheck(data);
    const app = new FileStorageApp({
        intents: [
            GatewayIntentBits.MessageContent,
        ],
        filesChannelName: params.filesChannelName,
        metaChannelName: params.metaChannelName,
        
        shouldEncrypt: params.enableEncrypt,
        encryptPassword: params.encryptPassword,
    }, params.guildId);

    console.log(color.yellow("Logging in..."));
    await app.login(params.token);
    await app.waitForReady();
    await app.preload();

    if (!params.skipPreload) {
        console.log(color.yellow("Preloading files..."));
        await app.loadFiles();
    } else {
        console.log(color.yellow("Skipping preload..."));
    }

    if (params.startWebdavServer) {
        const serverLaunchOptions: ServerOptions = {
            port: params.webdavPort,   
            rootFileSystem: new WebdavFilesystemHandler(app),
        }

        if (params.enableHttps) {
            console.log("Detected ENABLE_HTTPS env variable. Starting webdav server with https enabled.");

            // generate self-signed certificate: openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out cert.pem -days 365 -nodes
            checkIfFileExists(root.resolve("/certs/privkey.pem"), false, "Please set ssl ./certs/privKey.pem or generate a self-signed certificate");
            checkIfFileExists(root.resolve("/certs/cert.pem"), false, "Please set ssl ./certs/cert.pem or generate a self-signed certificate");
            checkIfFileExists(root.resolve("/certs/chain.pem"), true, "If you have chain file, please set ssl ./certs/chain.pem or generate a self-signed certificate");

            serverLaunchOptions.https = {
                key: readFileSyncOrUndefined(root.resolve("/certs/privkey.pem")),
                cert: readFileSyncOrUndefined(root.resolve("/certs/cert.pem")),
                ca: readFileSyncOrUndefined(root.resolve("/certs/chain.pem")),
            }
        }

   

        if (params.enableAuth) {
            if(params.users.length === 0) {
                printAndExit("Please set the USERS to your users in format username:password,username:password or add at least one user.");
            }

            console.log("Detected AUTH env variable. Starting webdav server with auth enabled.");
            serverLaunchOptions.enableAuth = true;
            serverLaunchOptions.users = params.usersParsed;
        }

        console.log("Starting webdav server...");
        const webdavServer = WebdavServer.createServer(serverLaunchOptions, app);

        await webdavServer.startAsync();
        console.log(color.green("WebDAV server started at port " + params.webdavPort + "."));

        // debug
        webdavServer.beforeRequest((arg, next) => {
            app.getLogger().info(">>>> ["+arg.request.socket.remoteAddress+"] > "+arg.request.method + ", " + arg.request.url);
            next();
        });

        webdavServer.afterRequest((arg, next) => {
            app.getLogger().info("<<<< ["+arg.request.socket.remoteAddress+"] >", arg.responseBody);
            next();
        });
    }

    return app;
}

export async function envBoot() {
    const token = checkEnvVariableIsSet("TOKEN", "Please set the TOKEN to your bot token");
    const guildId = checkEnvVariableIsSet("GUILD_ID", "Please set the GUILD_ID to your guild id");
    const filesChannelName = checkEnvVariableIsSet("FILES_CHANNEL", "Please set the FILES_CHANNEL to your files channel name", "string", "files");
    const metaChannelName = checkEnvVariableIsSet("META_CHANNEL", "Please set the META_CHANNEL to your meta channel name", "string", "meta");

    const startWebdavServer = checkEnvVariableIsSet("START_WEBDAV", "Please set the START_WEBDAV to true or false to start webdav server", "boolean", true) as boolean;
    const webdavPort = checkEnvVariableIsSet("PORT", "Please set the PORT to your webdav server port", "number", 3000) as number;

    const enableHttps = checkEnvVariableIsSet("ENABLE_HTTPS", "Please set the ENABLE_HTTPS to true or false to enable https", "boolean", false) as boolean;
    const skipPreload = checkEnvVariableIsSet("SKIP_PRELOAD", "Please set the SKIP_PRELOAD to true or false to skip preload", "boolean", false) as boolean;

    const enableAuth = checkEnvVariableIsSet("AUTH", "Please set the AUTH to true or false to enable auth", "boolean", false) as boolean;
    const users = checkEnvVariableIsSet("USERS", "Please set the USERS to your users in format username:password,username:password", "string", "") as string;
    
    const enableEncrypt = checkEnvVariableIsSet("ENCRYPT", "Please set the ENCRYPT to true or false to enable encryption", "boolean", false) as boolean;
    const encryptPassword = checkEnvVariableIsSet("ENCRYPT_PASS", "Please set the ENCRYPT_PASSWORD to your encryption password", "string", "") as string;

    return await boot({
        token,
        guildId,
        filesChannelName,
        metaChannelName,
        webdavPort,
        startWebdavServer,
        enableHttps,
        skipPreload,
        enableAuth,
        users: users,
        enableEncrypt,
        encryptPassword,
    })

    
}


export function checkIfFileExists(path: string, soft: boolean, assertString: string = ""): boolean {
    try {
        if (!fs.statSync(path).isFile()) {
            const string = "File " + path + " is not found" + (assertString.length > 0 ? ": " + assertString : "");
            if (!soft) {
                throw new Error(string);
            }
            console.warn(string);
            return false;
        }
    } catch (e) {
        return false;
    }
    return true;
}

export function checkEnvVariableIsSet(name: string, assertString: string, type: "string" | "number" | "boolean" = "string", defaultValue?: any): any {
    const value = process.env[name]!;
    if (!value) {
        if (defaultValue !== undefined) {
            print("Env variable " + name + " is not set" + (assertString.length > 0 ? ": " + assertString : "") + ". Using default value: " + (defaultValue === "" ? "N/A" : defaultValue));
            return defaultValue;
        }
        printAndExit("Required env variable " + name + " is not set" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
    };

    const valueLower = value.toLowerCase();

    if (type == "boolean") {
        if (valueLower === "true") {
            return true;
        } else if (valueLower === "false") {
            return false;
        } else {
            printAndExit("Env variable " + name + " is not set to true or false" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
        }
    }

    if (type == "number") {
        const number = parseInt(value!);
        if (isNaN(number)) {
            printAndExit("Env variable " + name + " is not set to number" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
        }
        return number;
    }

    if(type == "string" && value.length == 0){
        printAndExit("Env variable " + name + " is empty" + (assertString.length > 0 ? ": " + assertString : "") + ". Please set it in .env file or in your system environment variables.");
    }

    return value;
}

export function readFileSyncOrUndefined(path: string): string | undefined {
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
    // printAndExit("Uncaught exception, to prevent data loss, the app will be closed.");
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
});