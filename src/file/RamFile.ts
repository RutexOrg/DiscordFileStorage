import { Writable } from 'stream';
import { Readable } from 'stream';
import Folder from "./filesystem/Folder.js";
import ServerFile from "./ServerFile.js";
import MutableBuffer from "../helper/MutableBuffer.js"

/**
 * A file that is stored in ram.
 */
export default class RamFile extends ServerFile {
    private maxSize: number;
    private totalWrittenFiles: number = 0;
    private buffer: MutableBuffer;

    constructor(filename: string, totalSize: number, folder: Folder, maxSize: number = 128000 * 8, uploadedDate: Date = new Date()) {
        super(filename, totalSize, folder, uploadedDate);
        this.buffer = new MutableBuffer(maxSize);
        this.maxSize = maxSize;
        this.setFileType("ram");
    }

    // TODO: implement this properly
    public getReadable(confirmCloning: boolean): Readable {
        let buffer = Buffer.alloc(this.buffer.size);
        this.buffer.render(buffer);
        return new Readable({
            read(size: number){
                let chunk = buffer.slice(0, size);
                buffer = buffer.slice(size);
                this.push(chunk);
            },
            destroy(error, callback) {
                buffer = (null as any);
                callback(error);
            },
            autoDestroy: true
        });
    }

    public getWritable(): Writable {
        return new Writable({
            write: (chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) => {
                this.totalWrittenFiles += chunk.length;
                console.log("Writing " + chunk.length + " bytes to ramfile. Total: " + this.totalWrittenFiles + " bytes. Max: " + this.maxSize + " bytes.")
                this.buffer.write(chunk, encoding);
                if (this.buffer.size > this.buffer.capacity()) {
                    return callback(new Error("Ramfile too large: " + this.buffer.size + " > " + this.maxSize + " bytes"));
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
        this.buffer.clear();
        if(rm){
            this.rm();
        }
    }

    public getTotalSize(): number {
        return this.buffer.size;
    }


}