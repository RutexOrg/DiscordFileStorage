import { Writable } from 'stream';
import { Readable } from 'stream';
import Folder from "./filesystem/Folder";
import ServerFile from "./ServerFile";

/**
 * A file that is stored in ram.
 */
export default class RamFile extends ServerFile {
    private data: Buffer;
    private maxSize: number;

    constructor(filename: string, totalSize: number, folder: Folder, maxSize: number = 128000 * 8, uploadedDate: Date = new Date()) {
        super(filename, totalSize, folder, uploadedDate);
        this.data = Buffer.alloc(0);
        this.maxSize = maxSize;
        this.setFileType("ram");
    }

    public getReadable(): Readable {
        return Readable.from(this.data);
    }

    public getWritable(): Writable {
        return new Writable({
            write: (chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) => {
                this.data = Buffer.concat([this.data, chunk]);
                if (this.data.length > this.maxSize) {
                    return callback(new Error("Ramfile too large: " + this.data.length + " > " + this.maxSize + " bytes"));
                }
                callback();
            }
        });
    }

    public getTotalSize(): number {
        return this.data.length;
    }


}