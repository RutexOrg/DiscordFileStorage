import { Readable, Writable } from "stream";
import { ResourceType, v2 } from "webdav-server";
import { Errors, Path } from "webdav-server/lib/index.v2";
import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ServerFile from "../file/ServerFile";
import RamFile from "../file/RamFile";
import Folder from "../file/filesystem/Folder";

/**
 * Virtual file system wrapper on top of DiscordFileStorageApp.
 * Some methods are not implemented yet or not implemented at all but some basic functionality is working.
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
    private fs: Folder;

    constructor(client: DiscordFileStorageApp) {
        super(new VirtualDiscordFileSystemSerializer());
        this.app = client;
        
        this.cLockManager = new v2.LocalLockManager();
        this.cPropertyManager = new v2.LocalPropertyManager();
        this.fs = this.app.getFileSystem().getRoot();               
    }

    public getFs(): Folder {
        return this.fs;
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
        let entryInfo = this.fs.getElementTypeByPath(path.toString());
        if(entryInfo.isUnknown){
            return callback(Errors.ResourceNotFound);
        }
        if(entryInfo.isFolder){
            return callback(Errors.InvalidOperation); // TODO: some client (e.g. filezilla) tries to get size of folder. This is not supported yet.
        }
        let file = entryInfo.entry as ServerFile;
        return callback(undefined, file.getTotalSize());
    }

    // TODO: Implement this method
    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        // this.log(".availableLocks", path);
        return callback(undefined, []);
    }


    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        this.log(".readDir", path);
        let folder = this.fs.getFolderByPath(path.toString())!;
        folder.printHierarchyWithFiles(true);
        return callback(undefined, folder.getAllEntries());
        
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        const entryInfo = this.fs.getElementTypeByPath(path.toString());

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
        let existsCheckState = this.fs.getElementTypeByPath(path.toString());
        
        // this.log(".fastExistCheck", exists + " | " + path.toString());
        if(existsCheckState.isUnknown){
            return callback(false);
        }
        let exists = (existsCheckState.isFile || existsCheckState.isFolder) ?? false;

        return callback(exists);
    }
    
    protected _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.log(".create", path + " | " + ctx.type);
        if(ctx.type.isDirectory){
            this.fs.createHierarchy(path.toString());
            return callback();
        }else{
            console.log("Creating file; ", path.toString());
            this.fs.createFileHierarchy(path.toString(), path.fileName());
            return callback();
        }
    }

    async _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): Promise<void> {
        this.log(".openReadStream", path);
        let file = this.fs.getFileByPath(path.toString())!;
        

        if(!file.isUploaded() && file.getFileType() == "ram"){
            this.log(".openReadStream", "File is not uploaded, returning empty dummy stream");
            return callback(undefined, (file as RamFile).getReadable());
        }

        const stream = await this.app.getDiscordFileManager().getDownloadableReadStream(file)
        this.log(".openReadStream", "Stream opened"); 
        callback(undefined, stream);
    }


    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        this.log(".openWriteStream", path);
        this.log(".openWriteStream", "Creating write stream: " + ctx.estimatedSize );

        let existingFile = this.fs.getFileByPath(path.toString()); // being created in create() . 
        // //console.log("createdFile", existingFile);

        let folder = existingFile?.getFolder()!;
        // //console.log("folder", folder);
        
        // first creating file in the ram to be able to say system that file is created and ready to be written to.
        if(existingFile?.getFileType() == "remote" && existingFile?.isUploaded()){
            await this.app.getDiscordFileManager().deleteFile(existingFile, false);    
        }
        
        if(ctx.estimatedSize == -1){
            folder.removeFile(existingFile!);
            let ramFile = new RamFile(path.fileName(), 0, folder);
            return callback(undefined, ramFile.getWritable()); // since we dont support state, we can just return a void stream and create it when we have the size and the file is ready to be uploaded
        }


        if(existingFile?.getFileType() == "ram"){
            (existingFile as RamFile).cleanup(true);
        }else{
            folder.removeFile(existingFile!);
        }

        folder.printHierarchyWithFiles(true);
        let file = new ServerFile(path.fileName(), ctx.estimatedSize, folder);
        file.setMetaIdInMetaChannel(existingFile?.getMetaIdInMetaChannel()!);
        
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


    async _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): Promise<void> {
        this.log(".delete", path);
        let entryCheck = this.fs.getElementTypeByPath(path.toString());
        if(entryCheck.isUnknown){
            return callback(Errors.ResourceNotFound);
        }

        if(entryCheck.isFolder){
            this.fs.removeFolderHierarchy(entryCheck.entry as Folder);
            return callback();
        }
        
        let file = entryCheck.entry as ServerFile;

        if(!file.isUploaded()){
            this.fs.removeFile(file!);
            return callback();
        }
        //console.log(file);
        //console.log(file.getAbsolutePath());
        this.fs.printHierarchyWithFiles();

        this.fs.removeFile(file!);
        await this.app.getDiscordFileManager().deleteFile(file, false);
        return callback();
    }


    protected _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): void {
        this.log(".copy", pathFrom + " | " + pathTo);
        return callback(Errors.InvalidOperation);
    }

    // very dirty, TODO: clean up
    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.log(".move", pathFrom + " | " + pathTo);

        let sourceEntry = this.fs.getElementTypeByPath(pathFrom.toString());
        let targetEntry = this.fs.getElementTypeByPath(pathTo.toString());

        //console.log("sourceEntry", sourceEntry);
        //console.log("targetEntry", targetEntry);


        if(sourceEntry.isUnknown || !targetEntry.isUnknown){
            return callback(Errors.InvalidOperation);
        }
 
        if(sourceEntry.isFile){
            let file = this.fs.getFileByPath(pathFrom.toString())!;
            
            let newFolder = this.fs.prepareFileHierarchy(pathTo.toString());
            let oldFolder = file.getFolder()!;
            file.setFolder(newFolder);
            file.setFileName(pathTo.fileName());

            // //console.log("pathTo: " + pathTo.fileName());
            // //console.log("absolutePath: " + newFolder.getAbsolutePath());
            this.fs.moveFile(file, oldFolder, newFolder.getAbsolutePath());
            if(file.isUploaded()){
               await this.app.getDiscordFileManager().updateMetaFile(file);
            }
            return callback(undefined, true);
        }

        if(sourceEntry.isFolder){
            let folder = this.fs.getFolderByPath(pathFrom.toString())!; // /test
            let newFolder = this.fs.createHierarchy(pathTo.toString()); // /asd
            let parent = folder.getParent()!; // /
            
            parent.removeFolder(folder);
            folder.getFiles().forEach(file => {
                file.setFolder(newFolder);
            });
            newFolder.setFiles(folder.getFiles());

            //console.log("folder", folder);
            //console.log("newFolder", newFolder);
            return callback(undefined, false)
            // return callback(Errors.InvalidOperation);
        }

        return callback(Errors.InvalidOperation);
    }

    async _rename(pathFrom: v2.Path, newName: string, ctx: v2.RenameInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.log(".rename", pathFrom + " | " + newName);
        let entryCheck = this.fs.getElementTypeByPath(pathFrom.toString());
        if(entryCheck.isUnknown){
            return callback(Errors.ResourceNotFound);
        }

        if(entryCheck.isFolder){
            let folder = entryCheck.entry as Folder;
            folder.setName(newName);
            return callback(undefined, true);
        }

        let file = entryCheck.entry as ServerFile;
        file.setFileName(newName);
        if(file.isUploaded()){
            await this.app.getDiscordFileManager().updateMetaFile(file);
        }
        return callback(undefined, true);
    }

    protected _lastModifiedDate(path: v2.Path, ctx: v2.LastModifiedDateInfo, callback: v2.ReturnCallback<number>): void {
        let entryCheck = this.fs.getElementTypeByPath(path.toString());
        if(entryCheck.isUnknown){
            return callback(Errors.ResourceNotFound);
        }

        if(entryCheck.isFolder){
            return callback(undefined, 0);
        }

        let file = entryCheck.entry as ServerFile;
        return callback(undefined, file.getUploadedDate().valueOf());
    }



}
