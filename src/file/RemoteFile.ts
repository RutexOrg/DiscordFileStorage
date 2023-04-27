import FileBase from "./FileBase.js";
import Folder, { VirtualFS } from "./filesystem/Folder.js";

export interface IChunkInfo {
    id: string;
    url: string;
    proxyUrl: string;
    length: number;
}

export interface IRemoteFile {
    filename: string;
    totalSize: number;
    folder: string;
    uploadDate: Date;
    modifiedDate: Date;
    attachmentInfos: IChunkInfo[];
    filesPostedInChannelId: string;
    metaIdInMetaChannel: string;
    metaVersion: number;
}

/**
 * Represents a file on the server side. This file is stored on the server.
 */
export default class RemoteFile extends FileBase {

    private chunks: IChunkInfo[] = [];
    private filesPostedInChannelId: string = "";
    private messageMetaIdInMetaChannel: string = "";
    private metaVersion: number = 0;


    constructor(filename: string, totalSize: number, folder: Folder, uploadedDate: Date) {
        super(filename, totalSize, folder, uploadedDate, new Date());
    }

    public getChunks(): IChunkInfo[] {
        return this.chunks;
    }

    public addChunk(discordMessageId: IChunkInfo): void {
        this.chunks.push(discordMessageId);
    }

    public setChunks(attachmentInfos: IChunkInfo[]): void {
        this.chunks = attachmentInfos;
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


    public cleanAttachmentInfos(): void {
        this.chunks = [];
    }


    public getMessageMetaIdInMetaChannel(): string {
        return this.messageMetaIdInMetaChannel;
    }

    public setMessageMetaIdInMetaChannel(metaId: string): void {
        this.messageMetaIdInMetaChannel = metaId;
    }


    public toJson() {
        return JSON.stringify(this.toObject());
    }

    static isValidRemoteFile(obj: any) : boolean {
        return obj.filename && 
            obj.totalSize && 
            obj.uploadDate && 
            obj.filesPostedInChannelId && 
            obj.attachmentInfos && obj.attachmentInfos.length > 0
    }

    toObject(): IRemoteFile {
        return {
            filename: this.getFileName(),
            totalSize: this.getSize(),
            uploadDate: this.getCreationDate(),
            modifiedDate: this.getModifyDate(),
            filesPostedInChannelId: this.getFilesPostedInChannelId(),
            metaIdInMetaChannel: this.getMessageMetaIdInMetaChannel(),
            metaVersion: this.metaVersion,
            folder: this.getAbsolutePath(),
            attachmentInfos: this.getChunks(),
        };
    }
    
    public static fromObject(obj: IRemoteFile, root: VirtualFS): RemoteFile {
        let folder = root.getRoot().prepareFileHierarchy(obj.folder);
        const file = new RemoteFile(obj.filename, obj.totalSize, folder, new Date(obj.uploadDate));
        console.dir(obj);
        file.setModifyDateDate(new Date(obj.modifiedDate ?? obj.uploadDate));
        file.setFilesPostedInChannelId(obj.filesPostedInChannelId);
        file.setChunks(obj.attachmentInfos);

        console.log("setup file", file);

        return file;
    }


    public isPosted(): boolean {
        return !!this.messageMetaIdInMetaChannel
    }
    
    public isUploaded(): boolean {
        return (this.chunks.length > 0 && !!this.messageMetaIdInMetaChannel);
    }

    public toString(): string {
        return "RemoteFile: " + this.getEntryName() + " (" + this.getSize() + " bytes), ("+this.getAbsolutePath()+"), with " + this.chunks.length + " attachment(s)";
    }

    

}