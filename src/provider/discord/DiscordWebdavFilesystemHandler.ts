import { Readable, Writable, Transform, PassThrough } from "stream";
import { ResourceType, v2 } from "webdav-server";
import { Errors } from "webdav-server/lib/index.v2.js";
import { Volume } from "memfs/lib/volume.js";
import mime from "mime-types";
import path from "path";
import DICloudApp from "../../DICloudApp.js";
import { IFileDesc } from "../../file/IFile.js";
import getFilesPathsRecursive from "../../helper/MemfsHelper.js";


function getContext(ctx: v2.IContextInfo) {
    return {
        host: ctx.context.headers.host,
        contentLength: ctx.context.headers.contentLength,
        useragent: ctx.context.headers.find("user-agent", "unkown useragent"),
        uri: ctx.context.requested.uri,
    }
}

/**
 * Virtual file system wrapper on top of DiscordFileStorageApp.
 */
export class VirtualDiscordFileSystemSerializer implements v2.FileSystemSerializer {
    uid(): string {
        return "virtual-discord-file-system@1.0.0";
    }
    serialize(fs: v2.FileSystem, callback: v2.ReturnCallback<any>): void {
        throw new Error("Method not implemented.");
    }
    unserialize(serializedData: any, callback: v2.ReturnCallback<v2.FileSystem>): void {
        throw new Error("Method not implemented.");
    }
}

export default class DiscordWebdavFilesystemHandler extends v2.FileSystem {
    private client: DICloudApp;
    private cLockManager: v2.LocalLockManager = new v2.LocalLockManager();
    private cPropertyManager: v2.LocalPropertyManager = new v2.LocalPropertyManager();
    private fs: Volume;

    constructor(client: DICloudApp) {
        super(new VirtualDiscordFileSystemSerializer());
        this.client = client;
        this.fs = client.getFs();


        // this.fs.watch("/", {recursive: true}, (event, filename) => {
        // console.log("delete!!!!" , event, filename);
        // });
    }


    protected _lockManager(path: v2.Path, ctx: v2.LockManagerInfo, callback: v2.ReturnCallback<v2.ILockManager>): void {
        return callback(undefined, this.cLockManager);
    }

    protected _propertyManager(path: v2.Path, ctx: v2.PropertyManagerInfo, callback: v2.ReturnCallback<v2.IPropertyManager>): void {
        return callback(undefined, this.cPropertyManager);
    }

    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        return callback(undefined, []);
    }


    /**
     * Returns the mime type of the file according to the file extension. (Not by the file content)
     * @param filename 
     * @returns 
     */
    private getMimeType(rPath: string): string {
        return mime.lookup(path.parse(rPath).base) || "application/octet-stream";
    }


    private getFile(path: v2.Path): IFileDesc {
        return JSON.parse(this.fs.readFileSync(path.toString()).toString(), (k, v) => {
            if (k === "created" || k === "modified") {
                return new Date(v);
            }
            return v;
        }) as IFileDesc;
    }

    private setFile(path: v2.Path, file: IFileDesc, notifyAboutChanges: boolean = false) {
        this.fs.writeFileSync(path.toString(), JSON.stringify(file));
        if (notifyAboutChanges) {
            this.client.markDirty();
        }
    }


    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        this.client.getLogger().info(".size", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            return callback(undefined, this.getFile(path).size);
        }

        return callback(Errors.NoSizeForAFolder);
    }

    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        this.client.getLogger().info(".readDir", path.toString(), getContext(ctx));


        const stat = this.fs.statSync(path.toString());

        if (stat.isDirectory()) {
            return callback(undefined, this.fs.readdirSync(path.toString()) as string[]);
        }

        return callback(Errors.ResourceNotFound);
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        this.client.getLogger().info(".type", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            return callback(undefined, ResourceType.File);
        } else if (stat.isDirectory()) {
            return callback(undefined, ResourceType.Directory);
        }

        return callback(Errors.ResourceNotFound);
    }

    protected _mimeType(path: v2.Path, ctx: v2.MimeTypeInfo, callback: v2.ReturnCallback<string>): void {
        this.client.getLogger().info(".mimeType", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            return callback(undefined, this.getMimeType(path.toString()));
        }

        return callback(Errors.NoMimeTypeForAFolder);
    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        // this.client.getLogger().info(".fastExistCheck", path.toString(), getContext(ctx));
        this.client.getLogger().info(".fastExistCheck", path.toString());

        return callback(this.fs.existsSync(path.toString()));
    }

    _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.client.getLogger().info(".create", path.toString(), getContext(ctx));

        const exists = this.fs.existsSync(path.toString());
        if (exists) {
            return callback(Errors.ResourceAlreadyExists);
        }

        if (ctx.type.isDirectory) {
            this.fs.mkdirSync(path.toString(), { recursive: true });
        }

        if (ctx.type.isFile) {
            this.setFile(path, {
                name: path.fileName(),
                size: 0,
                created: new Date(),
                modified: new Date(),
                chunks: [],
                uploaded: false
            });
        }

        this.client.markDirty();
        return callback();
    }


    // called on file download.
    async _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): Promise<void> {
        this.client.getLogger().info(".openReadStream (path, estimatedSize, ctx)", path.toString(), ctx.estimatedSize, getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (!stat.isFile()) {
            return callback(Errors.ResourceNotFound);
        }

        const file = this.getFile(path)
        if (!file.uploaded) {
            return callback(undefined, Readable.from(Buffer.from([])));
        }

        this.client.getLogger().info(".openReadStream, fetching: ", file.toString());
        const readStream = await this.client.getCurrentProvider().getDownloadReadStream(file)
        this.client.getLogger().info(".openReadStream", "Stream opened: " + path.toString());

        return callback(undefined, readStream);
    }

    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        const { targetSource, estimatedSize, mode } = ctx;
        this.client.getLogger().info(".openWriteStream", targetSource, estimatedSize, mode, "shouldEncrypt: ", this.client.shouldEncryptFiles());

        const stat = this.fs.statSync(path.toString());

        if (!stat.isFile()) {
            return callback(Errors.InvalidOperation);
        }

        const file = this.getFile(path);

        // if uploaded
        if (file.uploaded) {
            for (const chunk of file.chunks) {
                this.client.addToDeletionQueue({
                    channel: (await this.client.getFileChannel()).id,
                    message: chunk.id
                });
            }
            file.chunks = [];
            file.uploaded = false;
            this.setFile(path, file);
        }


        const writeStream = await this.client.getCurrentProvider().getUploadWriteStream(file, {
            onFinished: async () => {
                this.client.getLogger().info(".openWriteStream", "Stream finished: " + path.toString());
                file.uploaded = true;
                this.setFile(path, file, true);
            },
            onAbort: (err) => {
                if (err) {
                    this.client.getLogger().info(".openWriteStream", "Stream aborted: " + path.toString());
                    this.fs.rmSync(path.toString(), { recursive: true });
                }

            }
        });

        this.client.getLogger().info(".openWriteStream", "Stream opened: " + path.toString());

        return callback(undefined, writeStream);
    }


    async _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): Promise<void> {
        this.client.getLogger().info(".delete", path.toString(), getContext(ctx));

        const stat = this.fs.statSync(path.toString());

        if (stat.isFile()) {
            for (const chunk of this.getFile(path).chunks) {
                this.client.addToDeletionQueue({
                    channel: (await this.client.getFileChannel()).id,
                    message: chunk.id
                });
            }
        }

        if (stat.isDirectory()) {
            const pathFiles = getFilesPathsRecursive(this.fs, path.toString());
            for (const pathFile of pathFiles) {
                const file = this.getFile(new v2.Path(pathFile));
                if (file.uploaded) {
                    for (const chunk of file.chunks) {
                        this.client.addToDeletionQueue({
                            channel: (await this.client.getFileChannel()).id,
                            message: chunk.id
                        });
                    }
                }
            }
        }


        this.fs.rmSync(path.toString(), { recursive: true });
        this.client.markDirty();
        return callback();
    }


    // serverside copy
    async _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.client.getLogger().info(".copy", pathFrom + " | " + pathTo);

        const sourceExists = this.fs.existsSync(pathFrom.toString());
        const targetExists = this.fs.existsSync(pathTo.toString());

        if (!sourceExists || targetExists) {
            return callback(Errors.Forbidden);
        }

        const oldFile = this.getFile(pathFrom);
        const newFile: IFileDesc = {
            name: pathTo.fileName(),
            created: new Date(),
            modified: new Date(),
            size: oldFile.size,
            uploaded: false,
            chunks: []
        }

        const readStream = await this.client.getCurrentProvider().getDownloadReadStream(oldFile);
        const writeStream = await this.client.getCurrentProvider().getUploadWriteStream(newFile, {
            onFinished: async () => {
                this.client.getLogger().info(".copy", "Stream finished: " + pathTo.toString());
                newFile.uploaded = true;
                this.setFile(pathTo, newFile, true);
                return callback(undefined, true);
            },
            onAbort: (err) => {
                if (err) {
                    return callback(Errors.InvalidOperation);
                }
            },
        });

        readStream.pipe(writeStream);
    }

    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.client.getLogger().info(".move", pathFrom.toString(), pathTo.toString(), getContext(ctx));

        const sourceExists = this.fs.existsSync(pathFrom.toString());
        const targetExists = this.fs.existsSync(pathTo.toString());

        if (!sourceExists || targetExists) {
            return callback(Errors.InvalidOperation);
        }

        this.fs.renameSync(pathFrom.toString(), pathTo.toString());
        this.client.markDirty();

        return callback(undefined, true);
    }

    async _rename(pathFrom: v2.Path, newName: string, ctx: v2.RenameInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        //this.log(ctx.context, ".rename", pathFrom + " | " + newName);

        const oldPath = pathFrom.toString();
        const newPath = pathFrom.parentName() + "/" + newName;

        this.fs.renameSync(oldPath, newPath);
        callback(undefined, true);
    }

    protected _lastModifiedDate(path: v2.Path, ctx: v2.LastModifiedDateInfo, callback: v2.ReturnCallback<number>): void {
        // this.client.getLogger().info(".lastModifiedDate", path.toString());

        if (this.fs.statSync(path.toString()).isDirectory()) {
            return callback(undefined, new Date().getTime());
        }

        const file = this.getFile(path);
        return callback(undefined, file.modified.getTime());
    }

    protected _creationDate(path: v2.Path, ctx: v2.CreationDateInfo, callback: v2.ReturnCallback<number>): void {
        // this.client.getLogger().info(".creationDate", path.toString());

        if (this.fs.statSync(path.toString()).isDirectory()) {
            return callback(undefined, new Date().getTime());
        }

        const file = this.getFile(path);
        return callback(undefined, file.created.getTime());
    }


    protected _etag(path: v2.Path, ctx: v2.ETagInfo, callback: v2.ReturnCallback<string>): void {
        // this.client.getLogger().info(".etag", path.toString());

        const stat = this.fs.statSync(path.toString());

        if (stat.isDirectory()) {
            return callback(undefined, "0");
        }

        return callback(undefined, stat.mtimeMs.toString());
    }

}
