import mime from "mime-types";
import { INamingHelper } from "./filesystem/INamingHelper";

// remote = file is on the server
// ram = file is in memory
// ram defined in a RamFile.ts file
export type FileType = "remote" | "ram";

/**
 * Basic shared FileBase class that represents a file.  
 */
export default class FileBase implements INamingHelper {
    private filename: string;
    private totalSize: number;
    private uploadedDate: Date;
    private type: FileType = "remote";

    constructor(filename: string, totalSize: number, uploadedDate: Date = new Date()) {
        this.filename = filename;
        this.totalSize = totalSize;
        this.uploadedDate = uploadedDate;
    }
    getEntryName(): string {
        return this.filename;
    }

    public setFileType(type: FileType) {
        this.type = type;
    }

    public getFileType(): FileType {
        return this.type;
    }

    public getFileName(): string {
        return this.filename;
    }

    public setFileName(newName: string) {
        this.filename = newName;
    }


    public getTotalSize(): number {
        return this.totalSize;
    }

    public getUploadedDate(): Date {
        return this.uploadedDate;
    }

    public refreshUploadDate() {
        this.uploadedDate = new Date();
    }


    public setTotalSize(totalSize: number): void {
        this.totalSize = totalSize;
    }

    public getMimeType(): string {
        return mime.lookup(this.filename) || "application/octet-stream";
    }


    
}