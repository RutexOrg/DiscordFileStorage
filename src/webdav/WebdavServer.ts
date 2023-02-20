import { HTTPCodes, v2 as webdav } from "webdav-server";
import FolderTree from "../file/filesystem/FolderTree";
import WebdavFilesystemHandler from "./WebdavFilesystemHandler";
import util from "node:util";
import Folder from "../file/filesystem/Folder";
import { Server, IncomingMessage, ServerResponse } from "http";

export default class WebdavServer extends webdav.WebDAVServer {
    constructor(options: webdav.WebDAVServerOptions) {
        super(options);
        // TODO: add support for direct zip download of folders via http.
        
        // const defaultGetCallback = this.methods.get;
        // this.method("get", {
        //     unchunked: (ctx, data, callback) => {
        //         let path = ctx.requested.path;
        //         let entry = (this.rootFileSystem() as WebdavFilesystemHandler).getFs().getElementTypeByPath(path.toString());

        //         if(entry.isFolder){
        //             let fileEntry =entry.entry as Folder;
        //             console.log(fileEntry);
        //             ctx.setCode(HTTPCodes.OK);

        //         }
        //         return defaultGetCallback.unchunked!(ctx, data, callback);
        //     },

        //     isValidFor: (ctx, type) => {
        //         let path = ctx.requested.path;
        //         let entry = (this.rootFileSystem() as WebdavFilesystemHandler).getFs().getElementTypeByPath(path.toString());
        //         if(entry.isFolder){
        //             return true;
        //         }
        //         return defaultGetCallback.isValidFor!(ctx, type);
        //     },
        // })
    }
    

}