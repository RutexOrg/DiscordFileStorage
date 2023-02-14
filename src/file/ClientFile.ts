import FileBase from "./FileBase";
import fs from "fs";
import path from "path";

/**
 * Represents a file on the client side. This file is not stored on the server. 
 */
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

    public getReadableStream(maxChunkSize: number = 16000): fs.ReadStream {
        return fs.createReadStream(this.path, { highWaterMark: maxChunkSize })
    }

    public getWritableStream(): fs.WriteStream {
        return fs.createWriteStream(this.path);
    }

    private fsStat(): fs.Stats {
        return fs.statSync(this.path);
    }

    public isValid(): boolean {
        return this.fsStat().isFile();
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