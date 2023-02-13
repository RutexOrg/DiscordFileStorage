import FileBase from "./RemoteFileBase";
import fs from "fs";
import path from "path";

export default class ClientFile extends FileBase {
 
    private path: string;

    constructor(filename: string, totalSize: number, path: string, uploadedDate: Date = new Date()) {
        super(filename, totalSize, uploadedDate);
        this.path = path;
    }
    
    public getPath(): string {
        return this.path;
    }

    public setPath(path: string): void {
        this.path = path;
    }

    getReadableStream(maxChunkSize: number = 16000): fs.ReadStream {
        return fs.createReadStream(this.path, { highWaterMark: maxChunkSize })
    }

    getWritableStream(): fs.WriteStream {
        return fs.createWriteStream(this.path);
    }

    public static fromLocalPath(localPath: string): ClientFile {
        let stat = fs.statSync(localPath);
        if (!stat.isFile()) {
            throw new Error("Invalid local path");
        }

        let filename = path.basename(localPath);
        let totalSize = stat.size;
        let uploadDate = new Date();
        return new ClientFile(filename, totalSize, localPath, uploadDate);
    }

}