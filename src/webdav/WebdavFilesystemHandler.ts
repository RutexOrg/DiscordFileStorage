import { Readable, Writable } from "stream";
import { ResourceType, v2 } from "webdav-server";
import { Errors, Path } from "webdav-server/lib/index.v2";
import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ServerFile from "../file/ServerFile";
import VoidWritableBuffer from "../stream-helpers/VoidWritableBuffer";
import VoidReadableBuffer from "../stream-helpers/VoidReadableBuffer";
import RamFile from "../file/RamFile";
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

export default class WebdavFilesystemHandler extends v2.FileSystem {
    private app: DiscordFileStorageApp;
    private cLockManager: v2.LocalLockManager;
    private cPropertyManager: v2.LocalPropertyManager;
    
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


    private log(from: string, data: any){
        console.log(new Date().toTimeString().split(' ')[0] + ` [${from}] ${data}`);
    }
    
    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        let file = this.app.getFileSystem().getRoot().getFileByPath(path.toString());
        if(!file) {
            // return callback(undefined, this.app.getFiles().reduce((acc, file) => acc + file.getTotalSize(), 0));
            return callback(undefined, 0);
        }
        return callback(undefined, file.getTotalSize());
    }

    // TODO: Implement this method
    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        // this.log(".availableLocks", path);
        return callback(undefined, []);
    }


    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        this.log(".readDir", path);
        let folder = this.app.getFileSystem().getRoot().getFolderByPath(path.toString())!;
        folder.printHierarchyWithFiles(true);
        return callback(undefined, folder.getAllEntries());
        
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        // this.log(".type", path);
        const entryInfo = this.app.getFileSystem().getRoot().getElementTypeByPath(path.toString());
        if(entryInfo.isUnknown){
            return callback(Errors.ResourceNotFound);
        }
        
        // console.log(path.toString(), elementInfo)

        let resType;
        if(entryInfo.isFile){
            resType = ResourceType.File;
        } else if(entryInfo.isFolder){
            resType = ResourceType.Directory;
        } else {
            resType = ResourceType.NoResource
        };
        return callback(undefined, resType);
    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        let existsCheckState = this.app.getFileSystem().getRoot().getElementTypeByPath(path.toString());
        
        // this.log(".fastExistCheck", exists + " | " + path.toString());
        if(existsCheckState.isUnknown){
            return callback(false);
        }
        let exists = (existsCheckState.isFile || existsCheckState.isFolder) ?? false;

        return callback(exists);
    }

    protected _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): void {
        this.log(".openReadStream", path);
        let file = this.app.getFileSystem().getRoot().getFileByPath(path.toString())!;
        
        if(file instanceof RamFile){
            return callback(undefined, file.getReadable());
        }

        if(!file.isUploaded()){
            this.log(".openReadStream", "File is not uploaded, returning empty dummy stream");
            return callback(undefined, new VoidReadableBuffer());
        }

        this.app.getDiscordFileManager().getDownloadableReadStream(file).then(stream => {
            this.log(".openReadStream", "Stream opened"); 
            stream.on("data", (chunk) => {
                this.log(".openReadStream", "Stream data: " + chunk.length);   
            });
            callback(undefined, stream);
        }).catch(err => {
            console.log(err);
        });
    }

    protected _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.log(".create", path + " | " + ctx.type);
        if(ctx.type.isDirectory){
            console.log("Creating folder; ", path.toString());
            this.app.getFileSystem().getRoot().createHierarchy(path.toString());
            return callback();
        }else{
            console.log("Creating file; ", path.toString());
            this.app.getFileSystem().getRoot().createFileHierarchy(path.toString(), path.fileName());
            let test = this.app.getFileSystem().getRoot().getFileByPath(path.toString());
            return callback();
        }
    }

    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        this.log(".openWriteStream", path);
        this.log("!!!","Debug VSCode save algorithm");

        let createdFile = this.app.getFileSystem().getRoot().getFileByPath(path.toString()); // being created in create() to complete rest of requests. since we now ready to upload, we can remove it from the file system and replace with real file. 
        console.log("createdFile", createdFile);

        let folder = createdFile?.getFolder()!;
        console.log("folder", folder);
        
        if(createdFile?.isUploaded() && ctx.estimatedSize !== -1){
            await this.app.getDiscordFileManager().deleteFile(createdFile, false);    
        }
        
        if(ctx.estimatedSize == -1){
            // if(!folder || !createdFile){
            // console.log("performing prepareFileHierarchy")
            // let folder = this.app.getFileSystem().getRoot().prepareFileHierarchy(path.toString());
            // let ramFile = new RamFile(path.fileName(), 0, folder);
            // }
            // return callback(undefined, ramFile.getWritable()); // since we dont support state, we can just return a void stream and create it when we have the size and the file is ready to be uploaded
            return callback(undefined, new VoidWritableBuffer()); // since we dont support state, we can just return a void stream and create it when we have the size and the file is ready to be uploaded
        }

        this.log(".openWriteStream", "Creating write stream: " + ctx.estimatedSize );
        folder.removeFile(createdFile!);
        folder.printHierarchyWithFiles(true);
        let file = new ServerFile(path.fileName(), ctx.estimatedSize, folder);
        
        
        this.app.getDiscordFileManager().getUploadWritableStream(file!, ctx.estimatedSize).then(stream => {
            this.log(".openWriteStream", "Stream opened");
            callback(undefined, stream);
            stream.once("close", async () => {
                await this.app.getDiscordFileManager().postMetaFile(file!, false);
                this.log(".openWriteStream", "File uploaded");
            });
        }).catch(err => {
            console.log(err);
            return callback(err);
        });
    }


    protected _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): void {
        this.log(".delete", path);
        let isFileSystemEntry = this.app.getFileSystem().getRoot().getElementTypeByPath(path.toString());
        if(isFileSystemEntry.isFolder){
            this.app.getFileSystem().getRoot().removeFolderHierarchy(path.toString());
            return callback();
        }
        
        let file = this.app.getFileSystem().getRoot().getFileByPath(path.toString());
        if(!file) {
            return callback(Errors.ResourceNotFound);
        }

        if(!file.isUploaded()){
            this.app.getFileSystem().getRoot().removeFile(file!);
            return callback();
        }
        
        this.app.getDiscordFileManager().deleteFile(file, false).then(() => {
            this.app.getFileSystem().getRoot().removeFile(file!);
            return callback();
        }).catch(err => {
            return callback(Errors.IllegalArguments);
        });
    }


    protected _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): void {
        this.log(".copy", pathFrom + " | " + pathTo);
        return callback(Errors.InvalidOperation);
    }

    // not very clean, TODO: clean up
    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.log(".move", pathFrom + " | " + pathTo);

        let sourceEntry = this.app.getFileSystem().getRoot().getElementTypeByPath(pathFrom.toString());
        let targetEntry = this.app.getFileSystem().getRoot().getElementTypeByPath(pathTo.toString());

        console.log("sourceEntry", sourceEntry);
        console.log("targetEntry", targetEntry);


        if(sourceEntry.isUnknown || !targetEntry.isUnknown){
            return callback(Errors.InvalidOperation);
        }
 
        if(sourceEntry.isFile){
            let file = this.app.getFileSystem().getRoot().getFileByPath(pathFrom.toString())!;
            
            let newFolder = this.app.getFileSystem().getRoot().prepareFileHierarchy(pathTo.toString());
            let oldFolder = file.getFolder()!;
            file.setFolder(newFolder);
            file.setFileName(pathTo.fileName());

            console.log("pathTo: " + pathTo.fileName());
            console.log("absolutePath: " + newFolder.getAbsolutePath(true));
            this.app.getFileSystem().getRoot().moveFile(file, oldFolder, newFolder.getAbsolutePath(true));

            await this.app.getDiscordFileManager().updateMetaFile(file);
            return callback(undefined, true);
        }

        if(sourceEntry.isFolder){
            let folder = this.app.getFileSystem().getRoot().getFolderByPath(pathFrom.toString())!; // /test
            let newFolder = this.app.getFileSystem().getRoot().createHierarchy(pathTo.toString()); // /asd
            let parent = folder.getParent()!; // /
            
            parent.removeFolder(folder);
            newFolder.setFiles(folder.getFiles());

            console.log("folder", folder);
            console.log("newFolder", newFolder);
            return callback(undefined, false)
            // return callback(Errors.InvalidOperation);
        }

        return callback(Errors.InvalidOperation);
    }

    async _rename(pathFrom: v2.Path, newName: string, ctx: v2.RenameInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.log(".rename", pathFrom + " | " + newName);
        let file = this.app.getFileSystem().getRoot().getFileByPath(pathFrom.toString());
        this.app.getDiscordFileManager().renameFile(file!, newName).then(() => {
            return callback(undefined, true);
        }).catch(err => {
            console.log(err);   
            return callback(err);
        });

    }



}
