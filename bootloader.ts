import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs";
import root from "app-root-path";
import { GatewayIntentBits } from "discord.js";
import DICloudApp from "./src/DICloudApp.js";
import WebdavServer, { ServerOptions } from "./src/webdav/WebdavServer.js";
import DiscordWebdavFilesystemHandler from "./src/webdav/WebdavFileSystem.js";
import { getEnv, checkIfFileExists, readFileSyncOrUndefined, ensureStringLength, withResolvers } from "./src/helper/utils.js";
import Log from "./src/Log.js";
import { v2 as webdav } from "webdav-server/"
import express from "express";
import { IEntry } from "./src/file/VolumeEx";
import archiver from "archiver";


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
    enableAuth: boolean;
    users: string;
    enableEncrypt: boolean;
    encryptPassword: string;
    saveTimeout: number;
    saveToDisk: boolean;
}

export interface IBootParamsParsed extends IBootParams {
    usersParsed: IUserRecord[];
}

/**
 * Checks if the params are correct and in correct format. Function mutates the params object. Throws error if the params are not correct.
 * @param params - params to check
 * @returns - parsed params. 
 */
function bootPrecheck(params: IBootParams): IBootParamsParsed {

    if (params.enableEncrypt) {
        // TODO: add password check for downloading encrypted files in not encrypted server.
        if (!params.encryptPassword) {
            throw new Error("Please set the ENCRYPT_PASSWORD to your encryption password.");
        }

        if (params.encryptPassword.length <= 0 && params.encryptPassword.length > 32) {
            throw new Error("ENCRYPT_PASSWORD env variable is not in correct format. Please set it to a password between 1 and 32 characters. Current length: " + params.encryptPassword.length);
        }

        params.encryptPassword = ensureStringLength(params.encryptPassword, 32);
    }

    // regex: key:value,key:value,...
    if (params.enableAuth && !(/^(?:\w+:\w+,)*\w+:\w+$/i).test(params.users)) {
        throw new Error("USERS env variable is not in correct format. Please use format username1:password1,username2:password2");
    }

    const usersParsed: IUserRecord[] = params.users.split(",").map((user) => {
        const [username, password] = user.split(":");
        return { username, password };
    });

    if (params.enableAuth && usersParsed.length == 0) {
        throw new Error("USERS env variable is empty. Please set at least one user.");
    }

    if (params.saveTimeout < 1) {
        throw new Error("SAVE_TIMEOUT env variable is set to < 1ms. Please set it to at least 1ms.");
    }

    if (params.metaChannelName.toLowerCase() === params.filesChannelName.toLowerCase()) {
        throw new Error("META_CHANNEL and FILES_CHANNEL env variables are set to the same value. Please set them to different values.");
    }

    return {
        ...params,
        usersParsed,
    };
}


export async function boot(data: IBootParams): Promise<DICloudApp> {
    console.log(`NodeJS version: ${process.version}`);
    console.log("Starting DICloud...");
    const params = bootPrecheck(data);
    const app = new DICloudApp({
        intents: [
            GatewayIntentBits.MessageContent,
        ],
        filesChannelName: params.filesChannelName,
        metaChannelName: params.metaChannelName,

        shouldEncrypt: params.enableEncrypt,
        encryptPassword: params.encryptPassword,

        saveTimeout: params.saveTimeout,
        saveToDisk: params.saveToDisk,
    }, params.guildId);

    Log.info("Logging in...");
    await app.login(params.token);
    await app.init();

    if (params.startWebdavServer) {
        const web = express();

        const serverLaunchOptions: ServerOptions = {
            port: params.webdavPort,
            rootFileSystem: new DiscordWebdavFilesystemHandler(app),
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
            if (params.users.length === 0) {
                console.log("Please set the USERS to your users in format username:password,username:password or add at least one user.");
                console.log("Adding default user: admin:admin");
                params.usersParsed.push({ username: "admin", password: "admin" });
            }

            console.log("Detected AUTH env variable. Starting webdav server with auth enabled.");
            serverLaunchOptions.users = params.usersParsed;

            web.use((req, res, next) => {
                if (!req.headers.authorization) {
                    res.setHeader("WWW-Authenticate", 'Basic realm="DICloud Server"');
                    res.status(401).end();
                    return;
                }

                const auth = req.headers.authorization.split(" ")[1];
                const [username, password] = Buffer.from(auth, "base64").toString().split(":");

                const user = params.usersParsed.find((user) => user.username === username && user.password === password);
                if (!user) {
                    res.setHeader("WWW-Authenticate", 'Basic realm="DICloud Server"');
                    res.status(401).end();
                    return;
                }

                next();
            });
        }

        Log.info("Starting webdav server...");
        const webdavServer = WebdavServer.createServer(serverLaunchOptions, app);


        const relativePath = "dav";
        web.use(express.json());
        web.use(express.urlencoded({ extended: true }));
        web.use(webdav.extensions.express("/" + relativePath, webdavServer));

        // zip folder download, have to be first, because of the regex and priority of the routes.
        web.get(/.*\.zip$/, async (req, res) => {
            const path = req.path.replace(".zip", "");
            Log.info("[Zip] Requested path:", path);

            if(!app.getFs().existsSync(path)) {
                res.status(404).send("Not found");
                return;
            }

            const zip = archiver("zip");

            const files = app.getFs().getFilesWithPathRecursive(path);
            for (let [filePath, file] of Object.entries(files)) {
                // replace file path with relative path, so current relative path is root of the zip
                // filePath = filePath.replace(path, "");
                zip.append(await app.getProvider().createReadStream(file), { name: filePath });
            }

            zip.finalize();
            res.setHeader("Content-Type", "application/zip");
            zip.pipe(res);

        });


        // web file listings
        web.get("/*", async (req, res) => {
            const path = req.path;
            Log.info("Requested path:", path);

            if (!app.getFs().existsSync(path)) {
                res.status(404).send("Not found");
                return;
            }
            const files = app.getFs().getFilesAndFolders(path);

            const parentPath = path.split('/').slice(0, -1).join('/') || '/';

            const html = `
<!DOCTYPE html>
<html>
    <head>
        <title>DICloud Files</title>
        <style>
            body {
                font-family: 'Segoe UI', Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1 {
                color: #2c3e50;
                text-align: center;
                margin-bottom: 30px;
                padding-bottom: 10px;
                border-bottom: 2px solid #3498db;
            }
            .menu {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
                justify-content: center;
            }
            .menu-item {
                padding: 8px 16px;
                background-color: #3498db;
                color: white;
                text-decoration: none;
                border-radius: 4px;
            }
            .menu-item:hover {
                background-color: #2980b9;
            }
            ul {
                list-style: none;
                padding: 0;
            }
            .file {
                background-color: white;
                margin: 10px 0;
                padding: 12px 20px;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                transition: transform 0.2s ease;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .file:hover {
                transform: translateX(5px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            }
            .file a {
                color: #2980b9;
                text-decoration: none;
                font-size: 16px;
            }
            .file a:hover {
                color: #3498db;
            }
            .zip-link {
                color: #27ae60;
                padding-left: 15px;
            }
            .back-button {
                display: inline-block;
                padding: 8px 16px;
                background-color: #3498db;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                margin-bottom: 20px;
            }
            .back-button:hover {
                background-color: #2980b9;
            }
        </style>
    </head>
    <body>
        <div class="menu">
            <a href="/" class="menu-item">🏠 Home</a>
            <a href="${parentPath}" class="menu-item">⬅️ Parent Directory</a>
            <a href="${path}" class="menu-item">🔄 Refresh</a>
            ${path !== '/' ? `<a href="${path}.zip" class="menu-item">📥 Download Directory</a>` : ''}
        </div>
        <h1>DICloud Files</h1>
        <ul>
            ${files.map((file: IEntry) => {
                const currentPath = path === '/' ? '' : path;
                const filePath = file.file 
                    ? `/${relativePath}${currentPath}/${file.name}`
                    : `${currentPath}/${file.name}`;
                const zipPath = !file.file ? `${currentPath}/${file.name}.zip` : null;
                return `
                    <li class="file">
                        <a href="${filePath}">
                            ${file.file ? '' : '📁 '}${file.name}
                        </a>
                        ${zipPath ? `<a href="${zipPath}" class="zip-link">📥 Download ZIP</a>` : ''}
                    </li>
                `;
            }).join("")}
        </ul>
    </body>
</html>`;
            res.send(html);
        });

        await new Promise<void>((resolve, reject) => {
            web.listen(params.webdavPort, () => {
                Log.info("WebDAV server started at port", params.webdavPort);
                resolve();
            }).on('error', (err) => {
                reject(err);
            });
        });

        // debug logging for requests and responses
        webdavServer.beforeRequest((arg, next) => {
            Log.info("[S] IN [" + arg.request.socket.remoteAddress + "] > " + arg.request.method + ", " + arg.request.url);
            next();
        });

        webdavServer.afterRequest((arg, next) => {
            Log.info("[S] OUT [" + arg.request.socket.remoteAddress + "] >", "(" + arg.response.statusCode + ") " + arg.responseBody);
            next();
        });

        app.setWebdavServer(webdavServer);
        Log.info("Looks like everything is ready.");

    }

    return app
}

export async function envBoot() {
    const token = getEnv("TOKEN", "Please set the TOKEN to your bot token");
    const guildId = getEnv("GUILD_ID", "Please set the GUILD_ID to your guild id");
    const filesChannelName = getEnv("FILES_CHANNEL", "Please set the FILES_CHANNEL to your files channel name", "string", "files");
    const metaChannelName = getEnv("META_CHANNEL", "Please set the META_CHANNEL to your meta channel name", "string", "meta");

    const webdavPort = getEnv("PORT", "Please set the PORT to your webdav server port", "number", 3000) as number;

    const enableHttps = getEnv("ENABLE_HTTPS", "Please set the ENABLE_HTTPS to true or false to enable https", "boolean", false) as boolean;

    const enableAuth = getEnv("AUTH", "Please set the AUTH to true or false to enable auth", "boolean", false) as boolean;
    const users = getEnv("USERS", "Please set the USERS to your users in format username:password,username:password", "string", "") as string;

    const enableEncrypt = getEnv("ENCRYPT", "Please set the ENCRYPT to true or false to enable encryption", "boolean", false) as boolean;
    const encryptPassword = getEnv("ENCRYPT_PASS", "Please set the ENCRYPT_PASSWORD to your encryption password", "string", "") as string;

    const saveTimeout = getEnv("SAVE_TIMEOUT", "Please set the SAVE_TIMEOUT to your save timeout in ms", "number", 2000) as number;
    const saveToDisk = getEnv("SAVE_TO_DISK", "Please set the SAVE_TO_DISK to true or false to enable saving to disk", "boolean", false) as boolean;

    return await boot({
        token,
        guildId,
        filesChannelName,
        metaChannelName,
        webdavPort,
        enableHttps,
        enableAuth,
        users: users,
        enableEncrypt,
        encryptPassword,
        saveTimeout,
        saveToDisk,
        startWebdavServer: true,
    })

}


if (require.main === module) {
    process.on("uncaughtException", (err) => {
        console.log("Uncaught exception");
        console.trace(err)
        // printAndExit("Uncaught exception, to prevent data loss, the app will be closed.");
    });

    process.on("unhandledRejection", (reason, promise) => {
        console.trace(reason);
    });

    envBoot();
}