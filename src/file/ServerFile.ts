import FileBase from "./FileBase";

/**
 * Represents a file on the server side. This file is stored on the server.
 */
export default class ServerFile extends FileBase {
    private discordMessageIds: string[] = [];
    private filesPostedInChannelId: string = "";
    private metaIdInMetaChannel: string = "";

    private markedDeleted: boolean = false;
    private folders: string[];
    constructor(filename: string, totalSize: number, folders: string[], uploadedDate: Date = new Date()) {
        super(filename, totalSize, uploadedDate);
        this.folders = folders;
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



    public getFolders(): string[] {
        return this.folders;
    }

    public setFolders(folders: string[]): void {
        this.folders = folders;
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
            discordMessageIds: this.getDiscordMessageIds(),
            folders: this.folders
        };
    }
    
    public static fromObject(obj: any): ServerFile {
        const file = new ServerFile(obj.filename, obj.totalSize, obj.folders, new Date(obj.uploadDate));
        file.setFilesPostedInChannelId(obj.filesPostedInChannelId);
        file.setDiscordMessageIds(obj.discordMessageIds);

        return file;
    }

 


}