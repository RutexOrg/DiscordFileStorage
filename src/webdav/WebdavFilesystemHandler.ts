import { Readable, Writable, Transform, PassThrough } from "stream";
import { Lock, ResourceType, v2 } from "webdav-server";
import { Errors, IUser, LockKind } from "webdav-server/lib/index.v2.js";
import DiscordFileStorageApp from "../DiscordFileStorageApp.js";
import RemoteFile, { IChunkInfo } from "../file/RemoteFile.js";
import RamFile from "../file/RamFile.js";
import Folder from "../file/filesystem/Folder.js";
import crypto from "crypto";
import { INamingHelper } from "../file/filesystem/INamingHelper.js";
import { patchEmitter } from "../helper/EventPatcher.js";
import FileBase from "../file/FileBase.js";

function getUnixTimeStamp(offsetMinutes = 0) {
    return Math.floor(Date.now() / 1000) + offsetMinutes * 60;
}

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

    private createDecryptor() {
        const decipher = crypto.createDecipher("chacha20-poly1305", this.app.getEncryptPassword(), {
            autoDestroy: false,
        });

        decipher.once("error", (err) => { // TODO: debug error, for now just ignore, seems like md5 is normal.
            console.log("Decipher", err);
        });

        return decipher;
    }

    private createEncryptor() {
        const chiper = crypto.createCipher("chacha20-poly1305", this.app.getEncryptPassword(), {
            autoDestroy: false,
        });

        chiper.once("error", (err) => {
            console.log("Chiper", err);
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

    private shouldEncrypt(): boolean {
        return this.app.shouldEncryptFiles();
    }


    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        const entryInfo = this.fs.getEntryByPath(path.toString());
        if (path.isRoot()) {
            return callback(undefined, this.fs.getTotalSize());
        }

        if (entryInfo.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }
        if (entryInfo.isFolder) {
            return callback(undefined, (entryInfo.entry as Folder).getTotalSize());
        }

        const file = entryInfo.entry as (RemoteFile | RamFile);
        return callback(undefined, file.getSize());
    }

    protected _availableLocks(path: v2.Path, ctx: v2.AvailableLocksInfo, callback: v2.ReturnCallback<v2.LockKind[]>): void {
        return callback(undefined, []);
    }


    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        this.app.getLogger().info(".readDir", path.toString(), ctx);

        const folder = this.fs.getFolderByPath(path.toString())!;

        const entires = folder.getAllEntries().filter(e => {
            if (e.isFolder) {
                return true;
            }
            if (e.isFile) {
                const file = e.entry as (RemoteFile | RamFile);
                return file.isMarkedDeleted() === false;
            }
        });

        return callback(undefined, entires.map(e => {
            return (e.entry as INamingHelper).getEntryName();
        }));

    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        // console.log(ctx.context.user);
        const entryInfo = this.fs.getEntryByPath(path.toString());

        let resType: ResourceType;
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
        const entryInfo = this.fs.getEntryByPath(path.toString());
        if (entryInfo.isUnknown || entryInfo.isFolder) {
            return callback(Errors.NoMimeTypeForAFolder)
        }

        return callback(undefined, (entryInfo.entry as (RemoteFile | RamFile)).getMimeType());

    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        const existsCheckState = this.fs.getEntryByPath(path.toString());
        // //this.log(".fastExistCheck", exists + " | " + path.toString());
        if (existsCheckState.isUnknown) {
            return callback(false);
        }

        return callback((existsCheckState.isFile || existsCheckState.isFolder) ?? false);
    }

    _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.app.getLogger().info(".create", path.toString(), ctx);
        if (ctx.type.isDirectory) {
            this.fs.createFolderHierarchy(path.toString());
            return callback();
        } else {
            this.fs.createRAMFileHierarchy(path.toString(), path.fileName(), new Date());
            return callback();
        }
    }


    // called on file download.
    async _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): Promise<void> {
        this.app.getLogger().info(".openReadStream", path.toString(), ctx);
        console.log(".openReadStream!!!", ctx.estimatedSize);
        console.log(".openReadStream!!!", ctx.targetSource);
        const entryInfo = this.fs.getEntryByPath(path.toString());
        if (entryInfo.isUnknown || entryInfo.isFolder) {
            return callback(Errors.ResourceNotFound);
        }

        const file = entryInfo.entry as (RemoteFile | RamFile);
        console.log("read: ", file);

        if (file instanceof RamFile) {
            this.app.getLogger().info(".openReadStream", "Opening ram file: " + path.toString());
            return callback(undefined, (file as RamFile).getReadable(true));
        }

        console.log(".openReadStream, fetching: ", file.toString());
        const pt = new PassThrough();
        const readStream = await this.app.getDiscordFileManager().getDownloadableReadStream(file)
        this.app.getLogger().info(".openReadStream", "Stream opened: " + path.toString());


        if (this.shouldEncrypt()) {
            readStream.pipe(this.createDecryptor()).pipe(pt);
        } else {
            readStream.pipe(pt);
        }

        callback(undefined, pt);
    }

    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        const { targetSource, estimatedSize, mode } = ctx;
        console.log(".openWriteStream", targetSource, estimatedSize, mode);

        const entryInfo = this.fs.getEntryByPath(path.toString());
        let file = entryInfo.entry as (RemoteFile | RamFile);


        // looks like most managers does not provide estimated size on  newly created file. 
        // So we put it into ram to be able to say that file is created and give it back to open on client to allow modify it without have user to wait for initial upload.
        if (ctx.estimatedSize == -1 && entryInfo.entry instanceof RamFile) {
            console.log(".openWriteStream, ram file created: ", file.getAbsolutePath());
            return callback(undefined, entryInfo.entry.getWritable());
        }

        // at this point we need to update file with new attachments. since discord does not allow to update attachments, we need to delete old one and upload new one.
        // to do that we removing old file from VirtualFS and from discord, then creating new one and uploading it and putting it into VirtualFS back
        if (file instanceof RemoteFile) {
            await this.app.getDiscordFileManager().deleteFile(file);
        }

        file = new RemoteFile(path.fileName(), ctx.estimatedSize, file.rm(), file.getCreationDate());

        const pt = new PassThrough();
        const writeStream = await this.app.getDiscordFileManager().getUploadWritableStream(file, ctx.estimatedSize, {
            onFinished: async () => {
                this.app.getLogger().info(".openWriteStream", "File uploaded: " + path.toString());
                await this.app.getDiscordFileManager().postMetaFile(file as RemoteFile);
            },
        });

        this.app.getLogger().info(".openWriteStream", "Stream opened: " + path.toString());


        if (this.shouldEncrypt()) {
            callback(undefined, pt.pipe(this.createEncryptor()).pipe(writeStream));
        } else {
            callback(undefined, pt.pipe(writeStream));
        }
    }


    async _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): Promise<void> {
        this.app.getLogger().info(".delete", path.toString(), ctx);
        const entryCheck = this.fs.getEntryByPath(path.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.Forbidden);
        }

        if (entryCheck.isFolder) {
            if ((entryCheck.entry as Folder).getFiles().length == 0) {
                this.fs.removeFolderHierarchy(entryCheck.entry as Folder);
                return callback();
            } else {
                // const entires = (entryCheck.entry as Folder).getallEntriesRecursiveThis();
                return callback(Errors.InvalidOperation); // forcing the clients to delete files first, TODO: make it recursive
            }
        }

        const file = entryCheck.entry as (RemoteFile | RamFile);
        console.log(".delete, Trying to delete file", file)

        if (file instanceof RemoteFile) {
            await this.app.getDiscordFileManager().deleteFile(file, false);
        }
        file.rm();

        callback();
    }



    async _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        return callback(Errors.Forbidden);
    }

    // very, VERY dirty, TODO: clean up
    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.app.getLogger().info(".move", pathFrom.toString(), pathTo.toString(), ctx);

        const sourceEntry = this.fs.getEntryByPath(pathFrom.toString());
        const targetEntry = this.fs.getEntryByPath(pathTo.toString());

        if (sourceEntry.isUnknown || !targetEntry.isUnknown) {
            return callback(Errors.InvalidOperation);
        }

        if (sourceEntry.isFile) {
            const file = sourceEntry.entry as (RemoteFile | RamFile);

            const newFolder = this.fs.prepareFileHierarchy(pathTo.toString());
            const oldFolder = file.getFolder()!;
            file.setFolder(newFolder);
            file.setFileName(pathTo.fileName());

            console.log("pathTo: " + pathTo.fileName());
            console.log("absolutePath: " + newFolder.getAbsolutePath());
            this.fs.moveFile(file, oldFolder, newFolder.getAbsolutePath());
            if (file instanceof RemoteFile) {
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
                if (file.isFile && file.entry instanceof RemoteFile) {
                    await this.app.getDiscordFileManager().updateMetaFile(file.entry as RemoteFile);
                }
            }

            return callback(undefined, false)
        }

        return callback(Errors.InvalidOperation);
    }

    async _rename(pathFrom: v2.Path, newName: string, ctx: v2.RenameInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        //this.log(ctx.context, ".rename", pathFrom + " | " + newName);
        const entryCheck = this.fs.getEntryByPath(pathFrom.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            (entryCheck.entry as Folder).setName(newName);
            return callback(undefined, true);
        }

        const file = entryCheck.entry as (RemoteFile | RamFile);
        file.setFileName(newName);
        if (file instanceof RemoteFile) {
            await this.app.getDiscordFileManager().updateMetaFile(file);
        }
        return callback(undefined, true);
    }

    protected _lastModifiedDate(path: v2.Path, ctx: v2.LastModifiedDateInfo, callback: v2.ReturnCallback<number>): void {
        const entryCheck = this.fs.getEntryByPath(path.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            return callback(undefined, 0);
        }

        const file = entryCheck.entry as (RemoteFile | RamFile);
        console.log("getModDate: " + path.toString() + " " + file.getModifyDate());

        return callback(undefined, file.getModifyDate().valueOf());
    }

    protected _creationDate(path: v2.Path, ctx: v2.CreationDateInfo, callback: v2.ReturnCallback<number>): void {
        const entryCheck = this.fs.getEntryByPath(path.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            return callback(undefined, 0);
        }

        const file = entryCheck.entry as (RemoteFile | RamFile);
        console.log("getCreationDate: " + path.toString() + " " + file.getModifyDate());

        return callback(undefined, file.getCreationDate().valueOf());
    }



    protected _etag(path: v2.Path, ctx: v2.ETagInfo, callback: v2.ReturnCallback<string>): void {
        console.log(".etag", path.toString());
        const entryCheck = this.fs.getEntryByPath(path.toString());
        if (entryCheck.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entryCheck.isFolder) {
            return callback(undefined, "0");
        }

        const tag = entryCheck.entry instanceof FileBase ? (entryCheck.entry as FileBase).getETag() : Math.random().toString();
        console.log("etag: " + path.toString() + " " + tag);
        callback(undefined, tag);
    }



}
