/**
 * Basic shared FileBase class that represents a file.  
 */
export default class FileBase {
    private filename: string;
    private totalSize: number;
    private uploadedDate: Date;
    private isFileComplete: boolean = true;
    
    constructor(filename: string, totalSize: number, uploadedDate: Date = new Date()) {
        this.filename = filename;
        this.totalSize = totalSize;
        this.uploadedDate = uploadedDate;
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


    setTotalSize(totalSize: number): void {
        this.totalSize = totalSize;
    }
    
}