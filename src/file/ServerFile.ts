import FileBase from "./FileBase.js";
import Folder, { FolderTree } from "./filesystem/Folder.js";

export interface IAttachShortInfo {
    id: string;
    url: string;
    proxyUrl?: string;
}

export interface IServerFile {
    filename: string;
    totalSize: number;
    folder: string;
    uploadDate: Date;
    attachmentInfos: IAttachShortInfo[];
    filesPostedInChannelId: string;
    metaIdInMetaChannel: string;
    metaVersion: number;
    markedDeleted: boolean;
}

/**
 * Represents a file on the server side. This file is stored on the server.
 */
export default class ServerFile extends FileBase {

    private attachmentInfos: IAttachShortInfo[] = [];
    private filesPostedInChannelId: string = "";
    private metaIdInMetaChannel: string = "";
    private metaVersion: number = 0;
    private folder: Folder | null;

    private markedDeleted: boolean = false;

    constructor(filename: string, totalSize: number, folder: Folder, uploadedDate: Date) {
        super(filename, totalSize, uploadedDate);
        this.folder = folder;
        this.folder.addFile(this);
    }

    public getAttachmentInfos(): IAttachShortInfo[] {
        return this.attachmentInfos;
    }

    public addAttachmentInfo(discordMessageId: IAttachShortInfo): void {
        this.attachmentInfos.push(discordMessageId);
    }

    public setAttachmentInfos(attachmentInfos: IAttachShortInfo[]): void {
        this.attachmentInfos = attachmentInfos;
    }

    public getFilesPostedInChannelId(): string {
        return this.filesPostedInChannelId;
    }

    public setFilesPostedInChannelId(filesPostedInChannelId: string): void {
        this.filesPostedInChannelId = filesPostedInChannelId;
    }

    public getMetaVersion(): number {
        return this.metaVersion;
    }

    public setMetaVersion(metaVersion: number): void {
        this.metaVersion = metaVersion;
    }

    public getFolder(): Folder | null {
        return this.folder;
    }

    public setNullFolder(removeFile: boolean = false): void {
        this.folder = null as any;
    }

    public setFolder(folder: Folder, updateParents: boolean = false): void {
        if(updateParents && this.folder != null) {
            this.folder.removeFile(this);
            this.folder = folder;
            folder.addFile(this);
        }else{
            this.folder = folder;
        }

    }

    public getMetaIdInMetaChannel(): string {
        return this.metaIdInMetaChannel;
    }

    public setMetaIdInMetaChannel(metaId: string): void {
        this.metaIdInMetaChannel = metaId;
    }

    public isMarkedDeleted(): boolean {
        return this.markedDeleted;
    }

    public markDeleted(): void {
        this.markedDeleted = true;
    }

    public toJson() {
        return JSON.stringify(this.toObject());
    }

    static isValidRemoteFile(obj: any) : boolean {
        return obj.filename && 
            obj.totalSize && 
            obj.uploadDate && 
            obj.filesPostedInChannelId && 
            obj.attachmentInfos
    }

    toObject(): IServerFile {
        if(this.folder == null) {
            throw new Error("Folder is null");
        }

        return {
            filename: this.getFileName(),
            totalSize: this.getTotalSize(),
            uploadDate: this.getUploadedDate(),
            filesPostedInChannelId: this.getFilesPostedInChannelId(),
            metaIdInMetaChannel: this.getMetaIdInMetaChannel(),
            metaVersion: this.metaVersion,
            folder: this.getAbsolutePath(),
            attachmentInfos: this.getAttachmentInfos(),
            markedDeleted: this.markedDeleted,
        };
    }
    
    public static fromObject(obj: IServerFile, root: FolderTree): ServerFile {
        let folder = root.getRoot().prepareFileHierarchy(obj.folder);
        const file = new ServerFile(obj.filename, obj.totalSize, folder, new Date(obj.uploadDate));
        file.setFilesPostedInChannelId(obj.filesPostedInChannelId);
        file.setAttachmentInfos(obj.attachmentInfos);

        return file;
    }

    public getAbsolutePath(): string {
        if(this.folder == null) {
            throw new Error("Folder is null");
        }
        return this.folder.getAbsolutePath() + this.getFileName();
    }

    public isUploaded(): boolean {
        return this.attachmentInfos.length > 0 && !!this.metaIdInMetaChannel;
    }
 


}