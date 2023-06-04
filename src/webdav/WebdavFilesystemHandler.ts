import { Readable, Writable, Transform, PassThrough } from "stream";
import { Lock, ResourceType, v2 } from "webdav-server";
import { Errors, IUser, LockKind } from "webdav-server/lib/index.v2.js";
import DiscordFileStorageApp from "../DiscordFileStorageApp.js";
import RemoteFile, { IChunkInfo } from "../file/RemoteFile.js";
import RamFile from "../file/RamFile.js";
import Folder from "../file/filesystem/Folder.js";
import { IResourceHelper } from "../file/filesystem/IResourceHelper.js";
import { patchEmitter } from "../helper/EventPatcher.js";
import FileBase from "../file/FileBase.js";


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

    constructor(client: DiscordFileStorageApp) {
        super(new VirtualDiscordFileSystemSerializer());
        this.app = client;
        this.fs = this.app.getFileSystem().getRoot();
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

    public getFs(): Folder {
        return this.fs;
    }

    protected _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>): void {
        const entry = this.fs.getEntryByPath(path.toString());

        if (entry.isFolder) {
            return callback(undefined, this.fs.getallEntriesRecursiveThis().filter(e => e.isFile).map(e => e.entry as FileBase).reduce((prev, cur) => prev + cur.getSize(), 0))
        }

        if (entry.isFile) {
            return callback(undefined, (entry.entry as FileBase).getSize())
        }

        return callback(Errors.ResourceNotFound)
    }



    protected _readDir(path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>): void {
        this.app.getLogger().info(".readDir", path.toString(), getContext(ctx));
        const entry = this.fs.getEntryByPath(path.toString());

        if (entry.isFolder) {
            return callback(undefined, (entry.entry as Folder).getAllEntries().map(e => (e.entry as IResourceHelper).getEntryName()));
        }

        return callback(Errors.ResourceNotFound);
    }

    protected _type(path: v2.Path, ctx: v2.TypeInfo, callback: v2.ReturnCallback<v2.ResourceType>): void {
        // this.app.getLogger().info(".type", path.toString(), getContext(ctx));
        const entry = this.fs.getEntryByPath(path.toString());

        let resType = ResourceType.NoResource;
        if (entry.isFile) {
            resType = ResourceType.File;
        } else if (entry.isFolder) {
            resType = ResourceType.Directory;
        };

        return callback(undefined, resType);
    }

    protected _mimeType(path: v2.Path, ctx: v2.MimeTypeInfo, callback: v2.ReturnCallback<string>): void {
        // this.app.getLogger().info(".mimeType", path.toString(), getContext(ctx));
        const entry = this.fs.getEntryByPath(path.toString());
        if (entry.isUnknown || entry.isFolder) {
            return callback(Errors.NoMimeTypeForAFolder)
        }

        return callback(undefined, (entry.entry as FileBase).getMimeType());

    }

    protected _fastExistCheck(ctx: v2.RequestContext, path: v2.Path, callback: (exists: boolean) => void): void {
        // this.app.getLogger().info(".fastExistCheck", path.toString(), getContext(ctx));

        return callback(!this.fs.getEntryByPath(path.toString()).isUnknown);
    }

    _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback): void {
        this.app.getLogger().info(".create", path.toString(), getContext(ctx));
        if (ctx.type.isDirectory) {
            this.fs.createFolderHierarchy(path.toString());
        } else {
            this.fs.createRAMFileHierarchy(path.toString(), path.fileName(), new Date());
        }
        return callback();
    }


    // called on file download.
    async _openReadStream(path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>): Promise<void> {
        this.app.getLogger().info(".openReadStream (path, estimatedSize, ctx)", path.toString(), ctx.estimatedSize, getContext(ctx));
        const entry = this.fs.getEntryByPath(path.toString());

        if (entry.isUnknown || entry.isFolder) {
            return callback(Errors.ResourceNotFound);
        }

        const file = entry.entry as FileBase;
        this.app.getLogger().info("read: ", file);

        if (file instanceof RamFile) {
            this.app.getLogger().info(".openReadStream", "Opening ram file: " + path.toString());
            return callback(undefined, (file as RamFile).getReadable());
        }

        this.app.getLogger().info(".openReadStream, fetching: ", file.toString());
        const readStream = await this.app.getDiscordFileManager().getDownloadableReadStream(file as RemoteFile)
        this.app.getLogger().info(".openReadStream", "Stream opened: " + path.toString());

        return callback(undefined, readStream);
    }

    async _openWriteStream(path: v2.Path, ctx: v2.OpenWriteStreamInfo, callback: v2.ReturnCallback<Writable>): Promise<void> {
        const { targetSource, estimatedSize, mode } = ctx;
        this.app.getLogger().info(".openWriteStream", targetSource, estimatedSize, mode, "shouldEncrypt: ", this.app.shouldEncryptFiles());

        const entry = this.fs.getEntryByPath(path.toString());

        if(entry.isUnknown || entry.isFolder) {
            return callback(Errors.InvalidOperation);
        }

        let file = entry.entry as FileBase;

        // looks like most managers does not provide estimated size on  newly created file. 
        // So we put it into ram to be able to say that file is created and give it back to open on client to allow modify it without have user to wait for initial upload.
        // TODO: debug for big sizes.
        if (ctx.estimatedSize == -1 && entry.entry instanceof RamFile) {
            this.app.getLogger().info(".openWriteStream, ram file created: ", file.getAbsolutePath());
            return callback(undefined, entry.entry.getWritable());
        }

        // at this point we need to update file with new attachments. since discord does not allow to update attachments, we need to delete old one and upload new one.
        // to do that we removing old file from VirtualFS and from discord, then creating new one and uploading it and putting it into VirtualFS back
        if (file instanceof RemoteFile) {
            await this.app.getDiscordFileManager().deleteFile(file);
        }

        file = new RemoteFile(path.fileName(), ctx.estimatedSize, file.rm(), file.getCreationDate());

        const writeStream = await this.app.getDiscordFileManager().getUploadWritableStream(file as RemoteFile, ctx.estimatedSize, {
            onFinished: async () => {
                this.app.getLogger().info(".openWriteStream", "File uploaded: " + path.toString());
                await this.app.getDiscordFileManager().postMetaFile(file as RemoteFile);
            },
        });

        this.app.getLogger().info(".openWriteStream", "Stream opened: " + path.toString());


        return callback(undefined, writeStream);
    }


    async _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback): Promise<void> {
        this.app.getLogger().info(".delete", path.toString(), getContext(ctx));
        const entry = this.fs.getEntryByPath(path.toString());
        if (entry.isUnknown) {
            return callback(Errors.InvalidOperation);
        }

        if (entry.isFolder) {
            const entires = (entry.entry as Folder).getallEntriesRecursiveThis();

            for (const e of entires) {
                if (e.entry instanceof FileBase) {
                    if (e.entry instanceof RemoteFile) {
                        await this.app.getDiscordFileManager().deleteFile(e.entry, false);
                    }
                    e.entry.rm();
                }
            }

            this.fs.removeFolderHierarchy(entry.entry as Folder);
            return callback(undefined);
        }

        const file = entry.entry as FileBase;
        this.app.getLogger().info(".delete, Trying to delete file", file)

        if (file instanceof RemoteFile) {
            await this.app.getDiscordFileManager().deleteFile(file, false);
        }
        file.rm();
        callback();
    }


    // serverside copy
    async _copy(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.CopyInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        const source = this.fs.getEntryByPath(pathFrom.toString());
        const target = this.fs.getEntryByPath(pathTo.toString());

        if (source.isUnknown || !target.isUnknown) {
            return callback(Errors.InvalidOperation);
        }

        if (source.isFile) {
            const sourceTyped = source.entry as FileBase;
            const newFolder = this.fs.prepareFileHierarchy(pathTo.toString());

            const newFile = new RemoteFile(pathTo.fileName(), sourceTyped.getSize(), newFolder, sourceTyped.getCreationDate());
            newFile.updateModifyDate();

            const writeStream = await this.app.getDiscordFileManager().getUploadWritableStream(newFile as RemoteFile, sourceTyped.getSize(), {
                onFinished: async () => {
                    this.app.getLogger().info(".copy", "File uploaded: " + pathTo.toString());
                    await this.app.getDiscordFileManager().postMetaFile(newFile as RemoteFile);
                }
            });

            if (sourceTyped instanceof RamFile) {
                sourceTyped.getReadable().pipe(writeStream);
            } else {
                const readStream = (await this.app.getDiscordFileManager().getDownloadableReadStream(sourceTyped as RemoteFile));
                patchEmitter(readStream, "readStream", [/data/]);
                readStream.pipe(writeStream);

            }

            writeStream.on("finish", () => {
                this.app.getLogger().info(".copy", "File copied: " + pathTo.toString());
                callback(undefined, true);
            });

            writeStream.on("error", (err) => {
                this.app.getLogger().error(".copy", "Error while copying file: " + pathTo.toString(), err);
                callback(err);
            });

        }

        if (source.isFolder) {
            return callback(Errors.InvalidOperation); // TODO: implement
        }
    }

    // very, VERY dirty, TODO: clean up
    async _move(pathFrom: v2.Path, pathTo: v2.Path, ctx: v2.MoveInfo, callback: v2.ReturnCallback<boolean>): Promise<void> {
        this.app.getLogger().info(".move", pathFrom.toString(), pathTo.toString(), getContext(ctx));

        const sourceEntry = this.fs.getEntryByPath(pathFrom.toString());
        const targetEntry = this.fs.getEntryByPath(pathTo.toString());

        if (sourceEntry.isUnknown || !targetEntry.isUnknown) {
            return callback(Errors.InvalidOperation);
        }

        if (sourceEntry.isFile) {
            const file = sourceEntry.entry as FileBase;

            const newFolder = this.fs.prepareFileHierarchy(pathTo.toString());
            const oldFolder = file.getFolder()!;
            file.setFolder(newFolder);
            file.setFileName(pathTo.fileName());

            this.app.getLogger().info("pathTo: " + pathTo.fileName());
            this.app.getLogger().info("absolutePath: " + newFolder.getAbsolutePath());
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
        const entry = this.fs.getEntryByPath(pathFrom.toString());
        if (entry.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entry.isFolder) {
            (entry.entry as Folder).setName(newName);
            return callback(undefined, true);
        }

        const file = entry.entry as FileBase;
        file.setFileName(newName);
        if (file instanceof RemoteFile) {
            await this.app.getDiscordFileManager().updateMetaFile(file);
        }
        return callback(undefined, true);
    }

    protected _lastModifiedDate(path: v2.Path, ctx: v2.LastModifiedDateInfo, callback: v2.ReturnCallback<number>): void {
        const entry = this.fs.getEntryByPath(path.toString());
        if (entry.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entry.isFolder) {
            return callback(undefined, 0);
        }

        const file = entry.entry as FileBase;
        this.app.getLogger().info("getModDate: " + path.toString() + " " + file.getModifyDate());

        return callback(undefined, file.getModifyDate().valueOf());
    }

    protected _creationDate(path: v2.Path, ctx: v2.CreationDateInfo, callback: v2.ReturnCallback<number>): void {
        const entry = this.fs.getEntryByPath(path.toString());
        if (entry.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entry.isFolder) {
            return callback(undefined, 0);
        }

        const file = entry.entry as FileBase;
        this.app.getLogger().info("getCreationDate: " + path.toString() + " " + file.getModifyDate());

        return callback(undefined, file.getCreationDate().valueOf());
    }



    protected _etag(path: v2.Path, ctx: v2.ETagInfo, callback: v2.ReturnCallback<string>): void {
        this.app.getLogger().info(".etag", path.toString());
        const entry = this.fs.getEntryByPath(path.toString());
        if (entry.isUnknown) {
            return callback(Errors.ResourceNotFound);
        }

        if (entry.isFolder) {
            return callback(undefined, "0");
        }

        const tag = entry.entry instanceof FileBase ? (entry.entry as FileBase).getETag() : Math.random().toString();
        this.app.getLogger().info("etag: " + path.toString() + " " + tag);
        callback(undefined, tag);
    }

}
