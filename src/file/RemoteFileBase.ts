export default class FileBase {
    private filename: string;
    private totalSize: number;
    private uploadedDate: Date;

    constructor(filename: string, totalSize: number, uploadedDate: Date = new Date()) {
        this.filename = filename;
        this.totalSize = totalSize;
        this.uploadedDate = uploadedDate;
    }

    public getFileName(): string {
        return this.filename;
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