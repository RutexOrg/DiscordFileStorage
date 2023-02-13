import { Readable, Writable } from 'stream';
import path from "path";
import fse from "fs-extra";

class RemoteFile {
    private filename: string; // shared
    private totalSize: number; // shared
    private uploadDate: Date; // shared
    private localFilePath: string = ""; // client
    private discordMessageIds: Array<string> = []; // server
    private filesfilesPostedInChannelId: string = ""; // server
    private metaIdInMetaChannel: string = ""; // server

    constructor(filename: string, totalSize: number, uploadDate: Date, path?: string) {
        this.filename = filename;
        this.totalSize = totalSize;
        this.uploadDate = uploadDate;

        if (path) {
            this.localFilePath = path;
        }

    }

    public getFileName(): string {
        return this.filename;
    }

    public getTotalSize(): number {
        return this.totalSize;
    }


    public getUploadDate(): Date {
        return this.uploadDate;
    }

    public getDiscordMessageIds(): Array<string> {
        return this.discordMessageIds;
    }

    public getLocalFilePath(): string {
        return this.localFilePath;
    }

    public setLocalFilePath(localFilePath: string): void {
        this.localFilePath = localFilePath;
    }

    public addDiscordMessageId(discordMessageId: string): void {
        this.discordMessageIds.push(discordMessageId);
    }

    getFilesPostedInChannelId(): string {
        return this.filesfilesPostedInChannelId;
    }

    setFilesPostedInChannelId(filesfilesPostedInChannelId: string): void {
        this.filesfilesPostedInChannelId = filesfilesPostedInChannelId;
    }

    public setMetaIdInMetaChannel(metaId: string): void {
        this.metaIdInMetaChannel = metaId;
    }

    public getMetaIdInMetaChannel(): string {
        return this.metaIdInMetaChannel;
    }

    public isClientSide(): boolean {
        return this.localFilePath != "";
    }

    public isServerSide(): boolean {
        return this.filesfilesPostedInChannelId != "";
    }

    public isValid(): boolean {
        return fse.statSync(this.localFilePath).isFile();
    }

    public static isValidRemoteFile(obj: any): boolean {
        return obj.filename && obj.totalSize && obj.uploadDate && obj.discordMessageIds && obj.filesPostedInChannelId;
    }

    public static fromJson(obj: {
        filename: string,
        totalSize: number,
        blockSize: number,
        uploadDate: Date,
        filesPostedInChannelId: string,
    }): RemoteFile {
        if (!RemoteFile.isValidRemoteFile(obj)) {
            throw new Error("Invalid remote file");
        }
        const file = new RemoteFile(obj.filename, obj.totalSize, obj.uploadDate);
        for (const messageId of (obj as any).discordMessageIds) {
            file.addDiscordMessageId(messageId);
        }
        file.setFilesPostedInChannelId(obj.filesPostedInChannelId);
        return file;
    }

    public static fromLocalPath(localPath: string): RemoteFile {
        let stat = fse.statSync(localPath);
        if (!stat.isFile()) {
            throw new Error("Invalid local path");
        }

        let filename = path.basename(localPath);
        let totalSize = stat.size;
        let uploadDate = new Date();
        return new RemoteFile(filename, totalSize, uploadDate, localPath);
    }

    public toObject() {
        return {
            filename: this.filename,
            totalSize: this.totalSize,
            uploadDate: this.uploadDate,
            filesPostedInChannelId: this.filesfilesPostedInChannelId,
            discordMessageIds: this.discordMessageIds,
        };
    }


    public toJson() {
        return JSON.stringify(this.toObject());
    }

    public getReadableStream(maxBufferSize: number): Readable {
        return fse.createReadStream(this.localFilePath, {
            highWaterMark: maxBufferSize
        })
    }

    public getWritableStream(): Writable {
        return fse.createWriteStream(this.localFilePath);
    }






}