/**
 * Class that implements a simple webdav server with RFC 4918 support of: 
 * - GET
 * - PUT
 * - DELETE
 * - MKCOL
 * - MOVE
 * - COPY
 * - PROPFIND
 * - PROPPATCH
 * - LOCK
 * - UNLOCK
 * - OPTIONS
 * - HEAD
 * - POST
 */

import Folder from "../../file/filesystem/Folder";
import { IUserData } from "../WebdavServer";
import http, { Server as HttpServer } from "http";
import https, { Server as HttpsServer } from "https";
import { EventEmitter } from "events";

export enum WebdavServerMethod {
    GET = "GET",
    PUT = "PUT",
    DELETE = "DELETE",
    MKCOL = "MKCOL",
    MOVE = "MOVE",
    COPY = "COPY",
    PROPFIND = "PROPFIND",
    PROPPATCH = "PROPPATCH",
    LOCK = "LOCK",
    UNLOCK = "UNLOCK",
    OPTIONS = "OPTIONS",
    HEAD = "HEAD",
    POST = "POST",
}

export interface WebdavServerOptions {
    port: number;
    hostname: string;
    root: Folder;
    users?: IUserData[];
    enableAuth?: boolean;
    https?: {
        key: string;
        cert: string;
        ca?: string;
    };
}

export interface IRequestContext {
    translate: "f" | "t", // f - clean, t - translated
}


/**
 * Class that represents a path in the webdav server in unix format. 
 * Should parse any path and give representation of it.
 * / => root
 * /folder => folder
 * /folder/file => file
 * /folder/folder2 => folder2
 * /folder/folder2/file => file
 */
export class Path {
    private path: string;

    constructor(path: string) {
        if (!path.startsWith("/")) {
            throw new Error("Path must start with /");
        }

        this.path = path;
    }

    public toString(): string {
        return this.path;
    }

    private getPath(): string[] {
        return this.path.split("/").filter((part) => part !== "");
    }
}

export default class SimpleWebdavServer extends EventEmitter {
    private server: HttpServer | HttpsServer;
    private options: WebdavServerOptions;
    private handlers: Map<WebdavServerMethod, (ctx: IRequestContext, req: http.IncomingMessage, res: http.ServerResponse) => void> = new Map();


    constructor(options: WebdavServerOptions) {
        super();
        this.options = options;

        if (options.https) {
            this.server = https.createServer({
                key: options.https.key,
                cert: options.https.cert,
                ca: options.https.ca,
            });
        } else {
            this.server = http.createServer();
        }

        this.registerHandler(WebdavServerMethod.OPTIONS, (ctx, req, res) => {
            res.writeHead(200);
            const response = [
                "ALLOW: OPTIONS, GET",
                "DAV: 1, 2, 3, ordered-collections",
            ]
            res.write(response.join("\n"));
            res.end();
        });

    }


    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.options.port, this.options.hostname)
            this.server.once("listening", () => {
                console.log(`Server listening on port ${this.options.port}`);

                this.server.on("request", (req, res) => {
                    this.handleRequest(req, res);
                });
                resolve();
            }).once("error", (err) => {
                reject(err);
            });
        });


    }

    public registerHandler(method: WebdavServerMethod, handler: (ctx: IRequestContext, req: http.IncomingMessage, res: http.ServerResponse) => void) {
        this.handlers.set(method, handler);
    }

    // logs: date (hh:mm:ss) - ip - method - path - status - time (ms) - size of request (bytes) - body
    private logRequest(req: http.IncomingMessage) {
        const date = new Date();
        const ip = req.socket.remoteAddress;
        const method = req.method;
        const path = req.url;
        const time = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
        const size = req.headers["content-length"] || 0;
        const headers = JSON.stringify(req.headers);

        let body = "";
        req.on('readable', function () {
            body += req.read();
        });
        req.on('end', function () {
            console.log(`${time} - ${ip} - ${method} - ${path} - ${size}\n${headers}\n${body}`);
        });

    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        this.logRequest(req);
        const method = req.method as WebdavServerMethod;
        const handler = this.handlers.get(method);

        const context: IRequestContext = {
            translate: (!!req.headers["translate"] && req.headers["translate"].toString().toLowerCase() === "f") ? "f" : "t",
        }

        if (!handler) {
            console.log("Method " + method + " not found, returning 405.");
            res.writeHead(405);
            return res.end();
        }

        handler(context, req, res);
    }

}