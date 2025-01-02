import { Readable, Writable } from "stream";
import { ResourceType, v2, Errors } from "webdav-server";
import { LocalLockManager, LocalPropertyManager, Resource } from "webdav-server/lib/index.v2.js";


import mime from "mime-types";
import path from "path";
import { createVFile } from "../file/IFile";

import DICloudApp from "../DICloudApp.js";
import VolumeEx from "../file/VolumeEx.js";
import Log from "../Log.js";
import { ENCRYPTION_OVERHEAD } from "../provider/DiscordFileProvider";


class VirtualDiscordFileSystemSerializer implements v2.FileSystemSerializer {
    uid(): string { return "virtual-discord-file-system@1.0.0"; }
    serialize(fs: v2.FileSystem, callback: v2.ReturnCallback<any>): void { throw new Error("Method not implemented."); }
    unserialize(serializedData: any, callback: v2.ReturnCallback<v2.FileSystem>): void { throw new Error("Method not implemented."); }
}

export default class DiscordWebdavFilesystemHandler extends v2.FileSystem {
    private client: DICloudApp;
    private fs: VolumeEx;
    
    private locks: Map<string, LocalLockManager> = new Map();
    private properties: Map<string, LocalPropertyManager> = new Map();

    constructor(client: DICloudApp) {
        super(new VirtualDiscordFileSystemSerializer());
        this.client = client;
        this.fs = client.getFs();
    }


    protected _lockManager(path: v2.Path, ctx: v2.LockManagerInfo, callback: v2.ReturnCallback<v2.ILockManager>): void {
        return callback(undefined, this.createOrGetLockManager(path));
    }

    protected _propertyManager(path: v2.Path, ctx: v2.PropertyManagerInfo, callback: v2.ReturnCallback<v2.IPropertyManager>): void {
        return callback(undefined, this.getOrCreatePropManager(path));
    }

    private createOrGetLockManager(path: v2.Path): LocalLockManager {
        if (!this.locks.has(path.toString())) {
            this.locks.set(path.toString(), new LocalLockManager());
        }

        return this.locks.get(path.toString())!;
    }

    private getOrCreatePropManager(path: v2.Path): LocalPropertyManager {
        if (!this.properties.has(path.toString())) {
            this.properties.set(path.toString(), new LocalPropertyManager());
        }

        return this.properties.get(path.toString())!;
    }

    private cleanupLocksAndProperties(path: v2.Path) {
        this.locks.delete(path.toString());
        this.properties.delete(path.toString());
    }

    /**
     * Returns the mime type of the file according to the file extension. (Not by the file content)
     * @param filename 
     * @returns 
     */
    private getMimeType(rPath: string): string {
        return mime.lookup(path.parse(rPath).base) || "application/octet-stream";
    }

    // private valiatePath(path: v2.Path, callback: v2.ReturnCallback<v2.Resource>): void {
    //     if (!this.fs.existsSync(path.toString())) {
    //         return callback(Errors.ResourceNotFound);
    //     }
    // }


    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        Log.info(".size", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            const file = this.fs.getFile(path.toString());

            if(file.encrypted){
                return callback(undefined, file.size - (ENCRYPTION_OVERHEAD * file.chunks.length)); // -16 bytes for each chunk for encryption metadata. client side will wait for full file, so if we provide size with metadata, which exists only on the server, the client will wait for the metadata to be downloaded which will never happen.
            }
            return callback(undefined, file.size);
        }
        return callback(undefined, this.fs.getTreeSizeRecursive(path.toString()));
    }

    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        Log.info(".readDir", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isDirectory()) {
            return callback(undefined, this.fs.readdirSync(path.toString()) as string[]);
        }

        return callback(Errors.ResourceNotFound);
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        // Log.info(".type", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            return callback(undefined, ResourceType.File);
        } else if (stat.isDirectory()) {
            return callback(undefined, ResourceType.Directory);
        }

        return callback(undefined, ResourceType.NoResource);
    }

    protected _mimeType(path: v2.Path, ctx: v2.MimeTypeInfo, callback: v2.ReturnCallback<string>): void {
        Log.info(".mimeType", path.toString(), getContext(ctx));
        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            return callback(undefined, this.getMimeType(path.toString()));
        }

        return callback(Errors.NoMimeTypeForAFolder);
    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        // Log.info(".fastExistCheck", path.toString(), getContext(ctx));

        return callback(this.fs.existsSync(path.toString()));
    }

    _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        Log.info(".create", path.toString(), getContext(ctx));

        if (ctx.type.isDirectory) {
            this.fs.mkdirSync(path.toString(), { recursive: true });
        }

        if (ctx.type.isFile) {
            this.fs.setFile(path.toString(), createVFile(path.fileName(), 0, this.client.shouldEncryptFiles()));
        }

        this.client.markForUpload();
        return callback();
    }


    // called on file download.
    async _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): Promise<void> {
        Log.info(".openReadStream (path, estimatedSize, ctx)", path.toString(), ctx.estimatedSize, getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (!stat.isFile()){
            return callback(Errors.ResourceNotFound);
        }

        const file = this.fs.getFile(path.toString())
        if (file.size == 0 || file.chunks.length == 0) {
            Log.info(".openReadStream", "File has no chunks: " + path.toString());
            return callback(undefined, Readable.from([]));
        }

        Log.info(".openReadStream, creating read stream: ", file);
        const readStream = await this.client.getProvider().createReadStream(file)
        Log.info(".openReadStream", "Stream opened: " + path.toString());
        return callback(undefined, readStream);
    }


    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        const { targetSource, estimatedSize, mode } = ctx;
        Log.info(".openWriteStream", targetSource, estimatedSize, mode);

        const stat = this.fs.statSync(path.toString());

        if (!stat.isFile()) {
            return callback(Errors.InvalidOperation);
        }

        const file = this.fs.getFile(path.toString());

        // overwrite file
        this.client.getProvider().addToDeletionQueue(file.chunks.map(chunk => ({
            channel: this.client.getFilesChannel().id,
            message: chunk.id
        })));
        
        file.chunks = [];
        file.modified = new Date();
        this.fs.setFile(path.toString(), file);
        this.client.markForUpload();


        const writeStream = await this.client.getProvider().createWriteStream(file);

        writeStream.on("finish", () => {
            Log.info(".openWriteStream", "Stream finished: " + path.toString());
            this.fs.setFile(path.toString(), file);
            this.client.markForUpload();
        });

        writeStream.on("error", (err) => {
            Log.info(".openWriteStream", "Stream error: " + path.toString() + " | " + err);
            this.fs.rmSync(path.toString(), { recursive: true });
        });
        Log.info(".openWriteStream", "Stream opened: " + path.toString());

        return callback(undefined, writeStream);
    }


    async _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): Promise<void> {
        Log.info(".delete", path.toString(), getContext(ctx));

        if (path.toString() == "/") {
            return callback(Errors.InvalidOperation);
        }

        const stat = this.fs.statSync(path.toString());
        const filesToDelete: string[] = [];

        if (stat.isFile()) {
            filesToDelete.push(path.toString());
        }

        if (stat.isDirectory()) {
            filesToDelete.push(...this.fs.getPathsRecursive(path.toString()));
        }

        for (const fileToDelete of filesToDelete) {
            for (const chunk of this.fs.getFile(fileToDelete).chunks) {
                this.client.getProvider().addToDeletionQueue([{
                    channel: this.client.getFilesChannel().id,
                    message: chunk.id
                }]);
            }
        }

        this.fs.rmSync(path.toString(), { recursive: true });
        this.client.markForUpload();

        for (const fileToDelete of filesToDelete) {
            this.cleanupLocksAndProperties(new v2.Path(fileToDelete));
        }
        this.cleanupLocksAndProperties(path);


        return callback();
    }

    /**
     * Copies a file from pathFrom to pathTo. Automatically marks the client as dirty and updates the file system.
     * @param pathFrom 
     * @param pathTo 
     * @returns 
     */
    private copyFile(pathFrom: v2.Path, pathTo: v2.Path): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            if (!this.fs.existsSync(pathFrom.toString()) || pathFrom.toString() == pathTo.toString()) {
                return resolve(false);
            }

            this.fs.mkdirSync(path.parse(pathTo.toString()).dir, { recursive: true });

            const oldFile = this.fs.getFile(pathFrom.toString());
            const newFile = createVFile(pathTo.fileName(), oldFile.size, oldFile.encrypted);

            const readStream = await this.client.getProvider().createReadStream(oldFile);
            const writeStream = await this.client.getProvider().createWriteStream(newFile);

            writeStream.on("error", (err) => {
                Log.info(".copy", "Stream error: " + pathTo.toString() + " | " + err);
                return reject(false);
            });

            writeStream.on("finish", () => {
                Log.info(".copy", "Stream finished: " + pathTo.toString());
                this.fs.setFile(pathTo.toString(), newFile);
                
                this.locks.set(pathTo.toString(), new LocalLockManager());
                const oldProps = this.properties.get(pathFrom.toString());
                if (oldProps) {
                    this.properties.set(pathTo.toString(), oldProps);
                }

                
                this.client.markForUpload();
                
                return resolve(true);
            });

            readStream.pipe(writeStream);
        });
    }

    // serverside copy
    async _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        Log.info(".copy", pathFrom + " | " + pathTo);

        const sourceExists = this.fs.existsSync(pathFrom.toString());
        const targetExists = this.fs.existsSync(pathTo.toString());

        if (!sourceExists || targetExists) {
            return callback(Errors.Forbidden);
        }

        const sourceStat = this.fs.statSync(pathFrom.toString());

        if (sourceStat.isDirectory()) {
            let files = this.fs.getFilesWithPathRecursive(pathFrom.toString());
            for (let oldPath in files) {
                let newPath = pathTo.toString() + oldPath.substr(pathFrom.toString().length);
                if (!await this.copyFile(new v2.Path(oldPath), new v2.Path(newPath))) {
                    return callback(Errors.InvalidOperation);
                }
            }
        }

        if (sourceStat.isFile()) {
            if (!await this.copyFile(pathFrom, pathTo)) {
                return callback(Errors.InvalidOperation);
            }
        }

        return callback(undefined, true);
    }

    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        Log.info(".move", pathFrom.toString(), pathTo.toString(), getContext(ctx));

        const sourceExists = this.fs.existsSync(pathFrom.toString());
        const targetExists = this.fs.existsSync(pathTo.toString());

        if (!sourceExists || (targetExists && !ctx.overwrite)) {
            return callback(Errors.InvalidOperation);
        }

        
        if(ctx.overwrite && targetExists){
            const targetStat = this.fs.statSync(pathTo.toString());
            if(targetStat.isFile()){
                this.fs.rmSync(pathTo.toString(), { force: true });
            } else {
                return callback(Errors.InvalidOperation);
            }
        }
        
        this.fs.renameSync(pathFrom.toString(), pathTo.toString());
        this.client.markForUpload();

        this.locks.set(pathTo.toString(), new LocalLockManager());
        const oldProps = this.properties.get(pathFrom.toString());
        if (oldProps) {
            this.properties.set(pathTo.toString(), oldProps);
        }
        this.cleanupLocksAndProperties(pathFrom);

        return callback(undefined, true);
    }

    _rename(pathFrom: v2.Path, newName: string, ctx: v2.RenameInfo, callback: v2.ReturnCallback<boolean>): void {
        Log.info(".rename", pathFrom.toString(), newName, getContext(ctx));

        const oldPath = pathFrom.toString();
        const newPath = pathFrom.parentName() + "/" + newName;

        if (!this.fs.existsSync(oldPath)) {
            return callback(Errors.ResourceNotFound);
        }

        if (this.fs.existsSync(newPath)) {
            return callback(Errors.ResourceAlreadyExists);
        }

        this.locks.set(newPath, new LocalLockManager());
        const oldProps = this.properties.get(oldPath);
        if (oldProps) {
            this.properties.set(newPath, oldProps);
        }
        this.cleanupLocksAndProperties(pathFrom);


        this.fs.renameSync(oldPath, newPath);
        this.client.markForUpload();

        callback(undefined, true);
    }

    protected _lastModifiedDate(path: v2.Path, ctx: v2.LastModifiedDateInfo, callback: v2.ReturnCallback<number>): void {
        Log.info(".lastModifiedDate", path.toString(), getContext(ctx));

        if (this.fs.statSync(path.toString()).isDirectory()) {
            return callback(undefined, new Date().getTime());
        }

        const file = this.fs.getFile(path.toString());
        return callback(undefined, file.modified.getTime());
    }

    protected _creationDate(path: v2.Path, ctx: v2.CreationDateInfo, callback: v2.ReturnCallback<number>): void {
        // Log.info(".creationDate", path.toString(), getContext(ctx));

        if (this.fs.statSync(path.toString()).isDirectory()) {
            return callback(undefined, new Date().getTime());
        }

        const file = this.fs.getFile(path.toString());
        return callback(undefined, file.created.getTime());
    }


    protected _etag(path: v2.Path, ctx: v2.ETagInfo, callback: v2.ReturnCallback<string>): void {
        // Log.info(".etag", path.toString());

        const stat = this.fs.statSync(path.toString());

        if (stat.isDirectory()) {
            return callback(undefined, "0");
        }

        return callback(undefined, this.fs.getFile(path.toString()).modified.getTime().toString());
    }

}

function getContext(ctx: v2.IContextInfo) {
    return {
        host: ctx.context.headers.host,
        contentLength: ctx.context.headers.contentLength,
        useragent: ctx.context.headers.find("user-agent", "unkown useragent"),
        uri: ctx.context.requested.uri,
    }
}