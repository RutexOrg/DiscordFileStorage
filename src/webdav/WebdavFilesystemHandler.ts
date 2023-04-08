import { Readable, Writable, Transform, PassThrough } from "stream";
import { ResourceType, v2 } from "webdav-server";
import { Errors, IUser } from "webdav-server/lib/index.v2.js";
import DiscordFileStorageApp from "../DiscordFileStorageApp.js";
import ServerFile from "../file/ServerFile.js";
import RamFile from "../file/RamFile.js";
import Folder from "../file/filesystem/Folder.js";
import crypto from "crypto";


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
    private cLockManager: v2.LocalLockManager = new v2.LocalLockManager();
    private cPropertyManager: v2.LocalPropertyManager = new v2.LocalPropertyManager();
    private fs: Folder;

    private createDecryptor(){
        const decipher = crypto.createDecipher("chacha20-poly1305", this.app.getEncryptPassword(), {
            autoDestroy: false,
        });
        decipher.once("error", (err) => { // TODO: debug error, for now just ignore, seems like md5 is normal.
            console.log("decipher error", err);
        });

        return decipher;
    }

    private createEncryptor(){
        const chiper = crypto.createCipher("chacha20-poly1305", this.app.getEncryptPassword(), {
            autoDestroy: false,
        });
        chiper.once("error", (err) => {
            console.log("chiper error", err);
        });

        return chiper;
    }

    constructor(client: DiscordFileStorageApp) {
        super(new VirtualDiscordFileSystemSerializer());
        this.app = client;
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


    private log(ctx: v2.RequestContext, from: string, data: any) {
        console.log(new Date().toTimeString().split(' ')[0] + ` [${from}] ${data}`);
    }

    private shouldEncrypt(): boolean {
        return this.app.shouldEncryptFiles();
    }


    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        const entryInfo = this.fs.getElementTypeByPath(path.toString());
        if (path.isRoot()) {
            return callback(undefined, this.fs.getTotalSize());
        }

        if (entryInfo.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }
        if (entryInfo.isFolder) {
            return callback(Errors.InvalidOperation); // TODO: some client (e.g. filezilla) tries to get size of folder. This is not supported yet.
        }
        const file = entryInfo.entry as ServerFile;
        return callback(undefined, file.getTotalSize());
    }

    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        return callback(undefined, [
            new v2.LockKind(v2.LockScope.Exclusive, v2.LockType.Write),
        ]);
    }


    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        //this.log(ctx.context, ".readDir", path);
        const folder = this.fs.getFolderByPath(path.toString())!;
        folder.printHierarchyWithFiles(true, ".readDir");
        return callback(undefined, folder.getAllEntries());

    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        // console.log(ctx.context.user);
        const entryInfo = this.fs.getElementTypeByPath(path.toString());

        let resType;
        if (entryInfo.isFile) {
            resType = ResourceType.File;
        } else if (entryInfo.isFolder) {
            resType = ResourceType.Directory;
        } else {
            resType = ResourceType.NoResource
        };
        return callback(undefined, resType);
    }

    protected _mimeType(path: v2.Path, ctx: v2.MimeTypeInfo, callback: v2.ReturnCallback<string>): void {
        // this.log(ctx.context, ".mimeType", path);
        const entryInfo = this.fs.getElementTypeByPath(path.toString());
        if (entryInfo.isUnknown || entryInfo.isFolder) {
            return callback(Errors.NoMimeTypeForAFolder)
        }

        const file = entryInfo.entry as ServerFile;
        return callback(undefined, file.getMimeType());

    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        const existsCheckState = this.fs.getElementTypeByPath(path.toString());

        // //this.log(".fastExistCheck", exists + " | " + path.toString());
        if (existsCheckState.isUnknown) {
            return callback(false);
        }
        const exists = (existsCheckState.isFile || existsCheckState.isFolder) ?? false;

        return callback(exists);
    }

    protected _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.log(ctx.context, ".create", path + ", " + (ctx.type.isFile ? "file" : "folder"));
        if (ctx.type.isDirectory) {
            this.fs.createHierarchy(path.toString());
            return callback();
        } else {
            this.fs.createFileHierarchy(path.toString(), path.fileName());
            return callback();
        }
    }

    // called on file download.
    async _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): Promise<void> {
        this.log(ctx.context, ".openReadStream", path);
        const entryInfo = this.fs.getElementTypeByPath(path.toString());
        if (entryInfo.isUnknown || entryInfo.isFolder) {
            return callback(Errors.ResourceNotFound);
        }

        const file = entryInfo.entry as ServerFile;

        if (!file.isUploaded() && file.getFileType() == "ram") {
            this.log(ctx.context, ".openReadStream", "Opening ram file: " + path.toString());
            return callback(undefined, (file as RamFile).getReadable(true));
        }

        console.log(".openReadStream, fetching: ", file);
        const pt = new PassThrough();
        const readStream = await this.app.getDiscordFileManager().getDownloadableReadStream(file)
        this.log(ctx.context, ".openReadStream", "Stream opened: " + path.toString());


        if (this.shouldEncrypt()) {
            readStream.pipe(this.createDecryptor()).pipe(pt);
        }else{
            readStream.pipe(pt);
        }

        callback(undefined, pt);
    }


    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        this.log(ctx.context, ".openWriteStream", path);

        let { estimatedSize, mode, targetSource } = ctx
        console.log({ estimatedSize, mode, targetSource });


        const existingFile = this.fs.getFileByPath(path.toString()); // being created in create() . 
        console.log(".openWriteStream into createdFile", existingFile);

        const folder = existingFile?.getFolder()!;
        console.log(".openWriteStream in folder", folder);

        // first creating file in the ram to be able to say system that file is created and ready to be written to.
        console.log(".openWriteStream, check file attributes: ", existingFile?.getFileType(), existingFile?.isUploaded());
        if (existingFile?.getFileType() == "remote" && existingFile?.isUploaded()) {
            await this.app.getDiscordFileManager().deleteFile(existingFile);
        }


        if (ctx.estimatedSize == -1) { // windows explorer does not provide estimated size if file is newly created. so we put in into ram to be able to say that file is created and give it back to open on client and modify it without have user to wait for initial upload.
            console.log(".openWriteStream, estimatedSize == -1, creating ram file: ", path.toString());
            folder.removeFile(existingFile!);
            const ramFile = new RamFile(path.fileName(), 0, folder, 1024 * 1024 * 20, new Date()); // 20 mb, test
            console.log(".openWriteStream, ram file created: ", ramFile.getAbsolutePath());
            return callback(undefined, ramFile.getWritable());
        }


        if (existingFile?.getFileType() == "ram") {
            (existingFile as RamFile).cleanup(true);
        } else {
            folder.removeFile(existingFile!);
        }

        folder.printHierarchyWithFiles(true);
        const file = new ServerFile(path.fileName(), ctx.estimatedSize, folder, new Date());
        file.setMetaIdInMetaChannel(existingFile?.getMetaIdInMetaChannel()!);

        const pt = new PassThrough();
        const writeStream = await this.app.getDiscordFileManager().getUploadWritableStream(file!, ctx.estimatedSize)
        this.log(ctx.context, ".openWriteStream", "Stream opened: " + path.toString());


        
   
        if (this.shouldEncrypt()) {
            pt.pipe(this.createEncryptor()).pipe(writeStream);
        }else{
            pt.pipe(writeStream);
        }
        
        pt.once("close", async () => {
            await this.app.getDiscordFileManager().postMetaFile(file!);
            this.log(ctx.context, ".openWriteStream", "File uploaded: " + path.toString());
        });

        callback(undefined, pt);

    }


    async _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): Promise<void> {
        this.log(ctx.context, ".delete", path);
        const entryCheck = this.fs.getElementTypeByPath(path.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            this.fs.removeFolderHierarchy(entryCheck.entry as Folder);
            return callback();
        }

        const file = entryCheck.entry as ServerFile;

        if (!file.isUploaded()) {
            this.fs.removeFile(file!);
            return callback();
        }
        console.log(file);
        console.log(file.getAbsolutePath());
        this.fs.printHierarchyWithFiles();

        this.fs.removeFile(file!);
        await this.app.getDiscordFileManager().deleteFile(file);
        return callback();
    }



    protected _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): void {
        //this.log(ctx.context, ".copy", pathFrom + " | " + pathTo);
        return callback(Errors.InvalidOperation);
    }

    // very, VERY dirty, TODO: clean up
    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.log(ctx.context, ".move", pathFrom + " | " + pathTo);

        const sourceEntry = this.fs.getElementTypeByPath(pathFrom.toString());
        const targetEntry = this.fs.getElementTypeByPath(pathTo.toString());

        if (sourceEntry.isUnknown || !targetEntry.isUnknown) {
            return callback(Errors.InvalidOperation);
        }

        if (sourceEntry.isFile) {
            const file = sourceEntry.entry as ServerFile;

            const newFolder = this.fs.prepareFileHierarchy(pathTo.toString());
            const oldFolder = file.getFolder()!;
            file.setFolder(newFolder);
            file.setFileName(pathTo.fileName());

            console.log("pathTo: " + pathTo.fileName());
            console.log("absolutePath: " + newFolder.getAbsolutePath());
            this.fs.moveFile(file, oldFolder, newFolder.getAbsolutePath());
            if (file.isUploaded()) {
                await this.app.getDiscordFileManager().updateMetaFile(file);
            }
            return callback(undefined, true);
        }

        if (sourceEntry.isFolder) {
            const oldFolder = sourceEntry.entry as Folder;
            const newFolder = this.fs.prepareFolderHierarchy(pathTo.toString());

            oldFolder.getFiles().forEach(file => {
                newFolder.addFile(file);
            });

            newFolder.setFolders(oldFolder.getFolders(), true);

            oldFolder.removeThisFolder();
            oldFolder.setParentFolder(null);

            // TODO: maybe paths should be cached only in client and let user do path managing manually to avoid this loop?
            // or we should to extra table of folders and bind path to folderId to avoid this loop?
            for (let file of newFolder.getallEntriesRecursiveThis()) {
                if (file.isFile && (file.entry as ServerFile).isUploaded()) {
                    await this.app.getDiscordFileManager().updateMetaFile(file.entry as ServerFile);
                }
            }

            return callback(undefined, false)
        }

        return callback(Errors.InvalidOperation);
    }

    async _rename(pathFrom: v2.Path, newName: string, ctx: v2.RenameInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        //this.log(ctx.context, ".rename", pathFrom + " | " + newName);
        const entryCheck = this.fs.getElementTypeByPath(pathFrom.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            const folder = entryCheck.entry as Folder;
            folder.setName(newName);
            return callback(undefined, true);
        }

        const file = entryCheck.entry as ServerFile;
        file.setFileName(newName);
        if (file.isUploaded()) {
            await this.app.getDiscordFileManager().updateMetaFile(file);
        }
        return callback(undefined, true);
    }

    protected _lastModifiedDate(path: v2.Path, ctx: v2.LastModifiedDateInfo, callback: v2.ReturnCallback<number>): void {
        const entryCheck = this.fs.getElementTypeByPath(path.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            return callback(undefined, 0);
        }

        const file = entryCheck.entry as ServerFile;
        return callback(undefined, file.getUploadedDate().valueOf());
    }



}
