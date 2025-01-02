import { v2 as webdav } from "webdav-server";
import { Server, IncomingMessage, ServerResponse } from "http";
import DICloudApp from "../DICloudApp";
export interface IUserData {
    username: string;
    password: string;
}

export interface ServerOptions extends webdav.WebDAVServerOptions {
    users?: IUserData[];
    enableAuth?: boolean;
};

export default class WebdavServer extends webdav.WebDAVServer {
    private app: DICloudApp;
    
    private constructor(options: ServerOptions, app: DICloudApp) {
        super(options);
        this.app = app;
        // this.setupBeforeRequestHandler();
    }

    public static createServer(options: ServerOptions, app: DICloudApp): WebdavServer {
        const userManager = new webdav.SimpleUserManager();
        const privManager = new webdav.SimplePathPrivilegeManager();
        
        if (options.users) {
            options.users.forEach((user) => {
                privManager.setRights(userManager.addUser(user.username, user.password, true), "/", ["all"]);
            });
        }

        options.hostname = options.hostname || "0.0.0.0";

        return new WebdavServer({
            privilegeManager: options.enableAuth ? privManager : undefined,
            httpAuthentication: options.enableAuth ? new webdav.HTTPDigestAuthentication(userManager, "DICloud Server") : undefined,
            ...options,
        }, app);
    }

    async startAsync(): Promise<Server<typeof IncomingMessage, typeof ServerResponse>> {
        return super.startAsync(this.options.port!);
    }



}