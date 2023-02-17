import FileBase from "./FileBase";
import DiscordFileSystem from "./filesystem/DiscordFileSystem";
import Folder from "./filesystem/Folder";

/**
 * Represents a file on the server side. This file is stored on the server.
 */
export default class ServerFile extends FileBase {
    private discordMessageIds: string[] = [];
    private filesPostedInChannelId: string = "";
    private metaIdInMetaChannel: string = "";
    private metaVersion: number = 0;
    private folder: Folder;

    private markedDeleted: boolean = false;

    constructor(filename: string, totalSize: number, folder: Folder, uploadedDate: Date = new Date()) {
        super(filename, totalSize, uploadedDate);
        this.folder = folder;
        this.folder.addFile(this);
    }

    public getDiscordMessageIds(): string[] {
        return this.discordMessageIds;
    }

    public addDiscordMessageId(discordMessageId: string): void {
        this.discordMessageIds.push(discordMessageId);
    }

    public setDiscordMessageIds(discordMessageIds: string[]): void {
        this.discordMessageIds = discordMessageIds;
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

    public getFolder(): Folder {
        return this.folder;
    }

    public setFolder(folder: Folder, updateParents: boolean = false): void {
        if(updateParents) {
            this.folder.removeFile(this);
            this.folder = folder;
            this.folder.addFile(this);
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
            obj.discordMessageIds
    }

    toObject(): any {
        return {
            filename: this.getFileName(),
            totalSize: this.getTotalSize(),
            uploadDate: this.getUploadedDate(),
            filesPostedInChannelId: this.getFilesPostedInChannelId(),
            metaIdInMetaChannel: this.getMetaIdInMetaChannel(),
            metaVersion: this.metaVersion,
            folder: this.folder.getAbsolutePath() + "/" + this.getFileName(),
            discordMessageIds: this.getDiscordMessageIds(),
        };
    }
    
    public static fromObject(obj: any, root: DiscordFileSystem): ServerFile {
        let folder = root.getRoot().prepareFileHierarchy(obj.folder as string);
        const file = new ServerFile(obj.filename, obj.totalSize, folder, new Date(obj.uploadDate));
        file.setFilesPostedInChannelId(obj.filesPostedInChannelId);
        file.setDiscordMessageIds(obj.discordMessageIds);

        return file;
    }

    public getAbsolutePath(): string {
        return this.folder.getAbsolutePath() + "/" + this.getFileName();
    }

    public isUploaded(): boolean {
        return this.discordMessageIds.length > 0 && !!this.metaIdInMetaChannel;
    }
 


}