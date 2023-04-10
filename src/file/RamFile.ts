import { Writable } from 'stream';
import { Readable } from 'stream';
import Folder from "./filesystem/Folder.js";
import MutableBuffer from "../helper/MutableBuffer.js"
import FileBase from './FileBase.js';

/**
 * A file that is stored in ram.
 */
export default class RamFile extends FileBase {
    private maxSize: number;
    private totalWrittenFiles: number = 0;
    private buffer: MutableBuffer;

    constructor(filename: string, totalSize: number, folder: Folder, maxSize: number = 128000 * 8, uploadedDate: Date = new Date()) {
        super(filename, totalSize, folder, uploadedDate);
        this.buffer = new MutableBuffer(maxSize);
        this.maxSize = maxSize;
    }

    // TODO: implement this properly
    public getReadable(confirmCloning: boolean): Readable {
        return Readable.from(this.buffer.cloneNativeBuffer());
    }

    public getWritable(): Writable {
        return new Writable({
            write: (chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) => {
                this.totalWrittenFiles += chunk.length;
                // console.log("Writing " + chunk.length + " bytes to ramfile. Total: " + this.totalWrittenFiles + " bytes. Max: " + this.maxSize + " bytes.")
                this.buffer.write(chunk, encoding);
                if (this.buffer.size > this.buffer.capacity()) {
                    return callback(new Error("Ramfile too large: " + this.buffer.size + " > " + this.maxSize + " bytes"));
                }
                callback();
            }
        });
    }

    public rm(): Folder {
        this.buffer.clear();
        return super.rm();
    }

    public getSize(): number {
        return this.buffer.size;
    }

    public toString(): string {
        return "RamFile: " + this.getEntryName() + " (" + this.getSize() + " bytes), (" + this.getAbsolutePath() + ")";
    }

}