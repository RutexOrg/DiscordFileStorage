import mime from "mime-types";
import { INamingHelper } from "./filesystem/INamingHelper";
import Folder from "./filesystem/Folder";


/**
 * Basic shared FileBase class that represents a file.  
 */
export default abstract class FileBase implements INamingHelper {
    private filename: string;
    private totalSize: number;
    private creationDate: Date;
    private modifyDate: Date;
    private folder: Folder;
    private markedDeleted: boolean = false;
    private etag: string = "";

    constructor(filename: string, totalSize: number, folder: Folder, uploadedDate: Date = new Date(), lastChangedDate: Date = new Date()) {
        this.filename = filename;
        this.totalSize = totalSize;
        this.creationDate = uploadedDate;
        this.modifyDate = lastChangedDate;
        this.folder = folder;
        folder.addFile(this);
    }

    public isMarkedDeleted(): boolean {
        return this.markedDeleted;
    }

    public markDeleted(): void {
        this.markedDeleted = true;
    }


    public getFolder(): Folder {
        return this.folder;
    }

    public setNullFolder(): void {
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

    public getAbsolutePath(): string {
        if(this.folder == null) {
            throw new Error("Folder is null");
        }
        return this.folder.getAbsolutePath() + this.getFileName();
    }
    
    public getEntryName(): string {
        return this.filename;
    }

    
    public getFileName(): string {
        return this.filename;
    }

    public setFileName(newName: string) {
        this.filename = newName;
    }


    public getSize(): number {
        return this.totalSize;
    }

    public getCreationDate(): Date {
        return this.creationDate;
    }

    public setCreationDate(date: Date) {
        this.creationDate = date;
    }

    public getModifyDate(): Date {
        return this.modifyDate;
    }

    public setModifyDateDate(date: Date) {
        this.modifyDate = date;
    }

    public updateModifyDate() {
        this.modifyDate = new Date();
    }

    public setTotalSize(totalSize: number): void {
        this.totalSize = totalSize;
    }

    public getEtag(): string {
        return this.etag;
    }

    public setEtag(etag: string): void {
        this.etag = etag;
    }

    public getMimeType(): string {
        return mime.lookup(this.filename) || "application/octet-stream";
    }

    /**
     *  Removes this file from the folder and returns the folder.
     * @returns the folder that this file was in.
     */
    public rm(): Folder {
        const folder = this.folder;
        this.folder.removeFile(this);
        return folder;
    }


    
}