import { HTTPCodes, v2 as webdav } from "webdav-server";
import { Server, IncomingMessage, ServerResponse } from "http";
import { HTTPMethod } from "webdav-server/lib/index.v2";
import DiscordFileStorageApp from "../DiscordFileStorageApp";
import Folder from "../file/filesystem/Folder";

export interface IUserData {
    username: string;
    password: string;
}

export interface ServerOptions extends webdav.WebDAVServerOptions {
    users?: IUserData[];
    enableAuth?: boolean;
};

export default class WebdavServer extends webdav.WebDAVServer {
    private app: DiscordFileStorageApp;
    
    private constructor(options: ServerOptions, app: DiscordFileStorageApp) {
        super(options);
        this.app = app;
        // this.setupBeforeRequestHandler();
    }

    public static createServer(options: ServerOptions, app: DiscordFileStorageApp): WebdavServer {
        const userManager = new webdav.SimpleUserManager();
        const privManager = new webdav.SimplePathPrivilegeManager();
        
        if (options.users) {
            options.users.forEach((user) => {
                const webdavUser = userManager.addUser(user.username, user.password, true);
                privManager.setRights(webdavUser, "/", ["all"]);
            });
        }

        options.respondWithPaths = true;

        return new WebdavServer({
            privilegeManager: options.enableAuth ? privManager : undefined,
            httpAuthentication: options.enableAuth ? new webdav.HTTPDigestAuthentication(userManager, "DICloud Server") : undefined,
            ...options,
        }, app);
    }

    setupBeforeRequestHandler(){
        const defaultGetHandler = this.methods.get;
        
        this.method("GET", {
            isValidFor: (ctx, type) => {
                if(ctx.request.headers){
                    return defaultGetHandler.isValidFor!(ctx, type);
                }
                return true;
            },

            unchunked: (ctx, data, callback) => {
                if (!ctx.request.headers["isSource"]){
                    return defaultGetHandler.unchunked!(ctx, data, callback);
                }

                const e  = this.app.getFileSystem().getRoot().getEntryByPath(ctx.requested.path.toString());
                if (!e.entry || !e.isFolder) {
                    return defaultGetHandler.unchunked!(ctx, data, callback);
                }

                const folder = e.entry as Folder;
                
                ctx.setCode(HTTPCodes.OK);
                ctx.response.setHeader("Content-Type", "text/html");
                let html = "<html><head><title>Index of " + ctx.requested.path.toString() + "</title></head><body><h1>Index of " + ctx.requested.path.toString() + "</h1><hr><pre>";
                html += "<a href=\"../\">../</a><br>";

                folder.getAllEntries().forEach((entry) => {
                    if(entry.isFolder){
                        html += "<a href=\"" + entry.entry?.getEntryName() + "/\">" + entry.entry?.getEntryName() + "/</a><br>";
                    }else{
                        html += "<a href=\"" + entry.entry?.getEntryName() + "\">" + entry.entry?.getEntryName() + "</a><br>";
                    }
                });

                // footer: DICloud
                html += "</pre><hr><address>DICloud Server</address></body></html>";
                ctx.response.write(html)

                callback();
            },

        });
        
    }

    async startAsync(): Promise<Server<typeof IncomingMessage, typeof ServerResponse>> {
        return super.startAsync(this.options.port!);
    }



}