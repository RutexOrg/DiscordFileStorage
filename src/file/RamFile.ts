import { Writable } from 'stream';
import { Readable } from 'stream';
import Folder from "./filesystem/Folder.js";
import ServerFile from "./ServerFile.js";
import MutableBuffer from "./helper/MutableBuffer.js"

/**
 * A file that is stored in ram.
 */
export default class RamFile extends ServerFile {
    private maxSize: number;
    private totalWrittenFiles: number = 0;
    private data: MutableBuffer;

    constructor(filename: string, totalSize: number, folder: Folder, maxSize: number = 128000 * 8, uploadedDate: Date = new Date()) {
        super(filename, totalSize, folder, uploadedDate);
        this.data = new MutableBuffer(maxSize) as any;
        this.maxSize = maxSize;
        this.setFileType("ram");
    }

    public getReadable(): Readable {
        return Readable.from(this.data.flush());
    }

    public getWritable(): Writable {
        return new Writable({
            write: (chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) => {
                this.totalWrittenFiles += chunk.length;
                console.log("Writing " + chunk.length + " bytes to ramfile. Total: " + this.totalWrittenFiles + " bytes. Max: " + this.maxSize + " bytes.")
                this.data.write(chunk, encoding);
                if (this.data.size > this.data.capacity()) {
                    return callback(new Error("Ramfile too large: " + this.data.size + " > " + this.maxSize + " bytes"));
                }
                callback();
            }
        });
    }

    public rm(){
        if(this.getFolder() !== null) {
            this.getFolder()!.removeFile(this);
            this.setFolder(null as any);
        }
    }

    public cleanup(rm: boolean = false): void {
        this.data.clear();
        if(rm){
            this.rm();
        }
    }

    public getTotalSize(): number {
        return this.data.size;
    }


}