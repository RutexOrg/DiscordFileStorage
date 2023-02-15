import { Readable, Writable } from "stream";
import { ResourceType, v2 } from "webdav-server";
import { Errors } from "webdav-server/lib/index.v2";
import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ServerFile from "../file/ServerFile";
import color from "colors/safe";
import RamReadableBuffer from "../stream-helpers/RamReadableBuffer";
import debug from "debug";

/**
 * Virtual file system wrapper on top of DiscordFileStorageApp.
 * WARNING! Many methods are not implemented yet or not implemented at all but some very basic functionality is working.
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

export default class VirtualDiscordFileSystem extends v2.FileSystem {
    private app: DiscordFileStorageApp;
    private cLockManager: v2.LocalLockManager;
    private cPropertyManager: v2.LocalPropertyManager;
    private virtualCreatedFiles: string[] = [];

    constructor(client: DiscordFileStorageApp) {
        super(new VirtualDiscordFileSystemSerializer());
        this.app = client;
        
        this.cLockManager = new v2.LocalLockManager();
        this.cPropertyManager = new v2.LocalPropertyManager();
    }

    
    protected _lockManager(path: v2.Path, ctx: v2.LockManagerInfo, callback: v2.ReturnCallback<v2.ILockManager>): void {
        return callback(undefined, this.cLockManager);
    }

    protected _propertyManager(path: v2.Path, ctx: v2.PropertyManagerInfo, callback: v2.ReturnCallback<v2.IPropertyManager>): void {
        return callback(undefined, this.cPropertyManager);
    }

    private getFile(path: string): ServerFile | undefined {
        let fileName = path.split("/").pop();
        if(fileName === undefined) {
            return undefined;
        }

        return this.app.getFiles().find(file => file.getFileName().toLocaleLowerCase() === fileName?.toLocaleLowerCase());
    }

    private getFilenameFromPath(path: v2.Path): string | undefined {
        return path.toString().split("/").pop();
    }
    
    private containsInVirtualCreatedFiles(filename: string): boolean {
        return this.virtualCreatedFiles.includes(filename);
    }

    private log(from: string, data: any){
        console.log(new Date().toTimeString().split(' ')[0] + ` [${from}] ${data}`);
    }
    
    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        this.log(".size", path);
        let file = this.getFile(path.toString());
        if(!file) {
            return callback(undefined, 0);
        }
        return callback(undefined, file.getTotalSize());
    }

    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        this.log(".availableLocks", path);
        return callback(undefined, []);
    }


    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        this.log(".readDir", path);
        return callback(undefined, this.app.getFiles().map(file => file.getFileName()));
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        this.log(".type", path);
        if(path.toString() === "/") {
            return callback(undefined, ResourceType.Directory);
        }
        return callback(undefined, ResourceType.File);
    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        if(path.toString() == "/"){
            return callback(true);
        }
        this.log(".fastExistCheck", path);
        let requestedFile = this.getFilenameFromPath(path);
        if(!requestedFile) {
            return callback(false);
        }

        let existsCheck = this.app.getFiles().map(file => file.getFileName()).includes(requestedFile);
        let existsInVirtualCreatedFiles = this.containsInVirtualCreatedFiles(requestedFile);
        return callback(existsCheck || existsInVirtualCreatedFiles);
    }

    protected _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): void {
        this.log(".openReadStream", path);
        let file = this.getFile(path.toString());
        if(!file) {
            return callback(new Error("File not found"));
        }
        
        this.app.getFileManager().getDownloadableReadStream(file).then(stream => {
            this.log(".openReadStream", "Stream opened"); 
            callback(undefined, stream);
        }).catch(err => {
            console.log(err);
        });
    }

    protected _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.log(".create", path);
        if(ctx.type.isDirectory){
            return callback(Errors.InvalidOperation);
        }

        let requestedFile = this.getFilenameFromPath(path);
        if(!requestedFile) {
            return callback(Errors.IllegalArguments);
        }

        if(this.app.getFiles().map(file => file.getFileName()).includes(requestedFile)) {
            return callback(Errors.ResourceAlreadyExists);
        }

        this.virtualCreatedFiles.push(requestedFile);
        return callback();
    }

    protected _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): void {
        this.log(".openWriteStream", path);
        let requestedFile = this.getFilenameFromPath(path);
        if(!requestedFile) {
            return callback(Errors.ResourceNotFound);
        }


        if(this.app.getFiles().map(file => file.getFileName()).includes(requestedFile)) {
            return callback(Errors.ResourceAlreadyExists);
        }

        if(!this.containsInVirtualCreatedFiles(requestedFile)) {
            return callback(Errors.ResourceNotFound);
        }

        let creatingFileFirst = ctx.mode == "mustCreate";
        if(creatingFileFirst) {
            this.log(".openWriteStream", "Creating file first");
            let ramReadableBuffer = new RamReadableBuffer();
            callback(undefined, ramReadableBuffer);
            return;
        }

        this.log(".openWriteStream", "Creating write stream: " + ctx.estimatedSize );
        let file = new ServerFile(requestedFile, ctx.estimatedSize, []);
        
        this.app.getFileManager().getUploadWritableStream(file, ctx.estimatedSize).then(stream => {
            this.log(".openWriteStream", "Stream opened");
            callback(undefined, stream);
            stream.once("close", () => {
                this.app.getFileManager().postMetaFile(file, true).then(() => {
                    this.log(".openWriteStream", "File uploaded");
                });
            });
        }).catch(err => {
            console.log(err);
            return callback(err);
        });
    }


    protected _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): void {
        let fileName = this.getFilenameFromPath(path);
        let file = this.app.getFiles().find(file => file.getFileName() === fileName);
        if(!file) {
            return callback(Errors.ResourceNotFound);
        }

        this.app.getFileManager().deleteFile(file, true).then(() => {
            this.virtualCreatedFiles = this.virtualCreatedFiles.filter(vFile => vFile !== file!.getFileName() );
            return callback();
        }).catch(err => {
            return callback(Errors.IllegalArguments);
        });
    }


}
