import { Readable, Writable } from "stream";
import { ResourceType, v2 } from "webdav-server";
import { Errors, Path } from "webdav-server/lib/index.v2";
import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ServerFile from "../file/ServerFile";
import color from "colors/safe";
import VoidWritableBuffer from "../stream-helpers/VoidWritableBuffer";

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

    private getFile(path: Path): ServerFile | undefined {
        let fileName = path.fileName();
        if(!fileName) {
            return undefined;
        }

        return this.app.getFiles().find(file => file.getFileName().toLocaleLowerCase() === fileName?.toLocaleLowerCase());
    }

    private containsInVirtualCreatedFiles(filename: string): boolean {
        return this.virtualCreatedFiles.includes(filename);
    }

    private addToVirtualCreatedFiles(filename: string): void {
        if(!this.containsInVirtualCreatedFiles(filename)){
            this.virtualCreatedFiles.push(filename);
        }
    }

    private removeFromVirtualCreatedFiles(filename: string): void {
        this.virtualCreatedFiles = this.virtualCreatedFiles.filter(file => file !== filename);
    }


    private log(from: string, data: any){
        console.log(new Date().toTimeString().split(' ')[0] + ` [${from}] ${data}`);
    }
    
    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        // this.log(".size", path);
        let file = this.getFile(path);
        if(!file) {
            return callback(undefined, this.app.getFiles().reduce((acc, file) => acc + file.getTotalSize(), 0));
        }
        return callback(undefined, file.getTotalSize());
    }

    // TODO: Implement this method
    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        // this.log(".availableLocks", path);
        return callback(undefined, []);
    }


    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        // this.log(".readDir", path);
        return callback(undefined, this.app.getFiles().map(file => file.getFileName()));
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        // this.log(".type", path);
        if(path.toString() === "/") {
            return callback(undefined, ResourceType.Directory);
        }
        return callback(undefined, ResourceType.File);
    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        if(path.toString() == "/"){
            return callback(true);
        }
        // this.log(".fastExistCheck", path);
        // this.log(".dfastExistCheck", path.fileName());
        let requestedFile = path.fileName();

        let existsCheck = !!this.app.getFiles().map(file => file.getFileName()).find(file => file === requestedFile);
        let existsInVirtualCreatedFiles = this.containsInVirtualCreatedFiles(requestedFile);
        return callback(existsCheck || existsInVirtualCreatedFiles);
    }

    protected _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): void {
        this.log(".openReadStream", path);
        let file = this.getFile(path);
        if(!file) {
            return callback(new Error("File not found"));
        }
        
        this.app.getDiscordFileManager().getDownloadableReadStream(file).then(stream => {
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

        let requestedFile = path.fileName();
        if(!requestedFile) {
            return callback(Errors.IllegalArguments);
        }

        if(this.app.getFiles().map(file => file.getFileName()).includes(requestedFile)) {
            return callback(Errors.ResourceAlreadyExists);
        }

        this.addToVirtualCreatedFiles(requestedFile);
        return callback();
    }

    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        console.log(color.cyan("-------------------"));
        this.log(".openWriteStream","");
        console.dir({
            mode: ctx.mode,
            path: path,
            size: ctx.estimatedSize,
        });
        console.log(color.cyan("-------------------"));
        
        const serverFile = this.getFile(path);
        const size = ctx.estimatedSize; // -1 if creating file first
        const creatingFileFirst = size === -1;



        if(creatingFileFirst) {
            this.log(".openWriteStream", "Creating file first");
            callback(undefined, new VoidWritableBuffer());
            return;
        }
        
        if(serverFile){
            await this.app.getDiscordFileManager().deleteFile(serverFile, true);
        }

        this.addToVirtualCreatedFiles(path.fileName()); // need for fastExistCheck
        this.log(".openWriteStream", "Creating write stream: " + ctx.estimatedSize );
        let file = new ServerFile(path.fileName(), ctx.estimatedSize, []);
        
        this.app.getDiscordFileManager().getUploadWritableStream(file, ctx.estimatedSize).then(stream => {
            this.log(".openWriteStream", "Stream opened");
            callback(undefined, stream);
            stream.once("close", async () => {
                await this.app.getDiscordFileManager().postMetaFile(file, true);
                this.log(".openWriteStream", "File uploaded");
            });
        }).catch(err => {
            console.log(err);
            return callback(err);
        });
    }


    protected _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): void {
        let fileName = path.fileName();
        let file = this.app.getFiles().find(file => file.getFileName() === fileName);
        if(!file) {
            return callback(Errors.ResourceNotFound);
        }

        this.app.getDiscordFileManager().deleteFile(file, true).then(() => {
            this.virtualCreatedFiles = this.virtualCreatedFiles.filter(vFile => vFile !== file!.getFileName() );
            return callback();
        }).catch(err => {
            return callback(Errors.IllegalArguments);
        });
    }


}
