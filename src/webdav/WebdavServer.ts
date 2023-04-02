import { HTTPCodes, v2 as webdav } from "webdav-server";
import { Server, IncomingMessage, ServerResponse } from "http";

export interface IUserData {
    username: string;
    password: string;
}

export interface ServerOptions extends webdav.WebDAVServerOptions {
    users?: IUserData[];
    enableAuth?: boolean;
};

export default class WebdavServer extends webdav.WebDAVServer {
    private constructor(options: ServerOptions) {
        super(options);
    }

    public static createServer(options: ServerOptions): WebdavServer {
        const userManager = new webdav.SimpleUserManager();
        const privManager = new webdav.SimplePathPrivilegeManager();
        
        if (options.users) {
            options.users.forEach((user) => {
                const webdavUser = userManager.addUser(user.username, user.password, true);
                privManager.setRights(webdavUser, "/", ["all"]);
            });
        }

        return new WebdavServer({
            privilegeManager: options.enableAuth ? privManager : undefined,
            httpAuthentication: options.enableAuth ? new webdav.HTTPDigestAuthentication(userManager, "Webdav Server") : undefined,
            ...options,
        });
    }

    async startAsync(): Promise<Server<typeof IncomingMessage, typeof ServerResponse>> {
        return super.startAsync(this.options.port!);
    }

}