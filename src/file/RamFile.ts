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
    private buffer: MutableBuffer;

    constructor(filename: string, totalSize: number, folder: Folder, maxSize: number = 128000 * 8, uploadedDate: Date = new Date()) {
        super(filename, totalSize, folder, uploadedDate, new Date());
        this.buffer = new MutableBuffer(maxSize);
        this.maxSize = maxSize;
    }

    public getReadable(): Readable {
        return Readable.from(this.buffer.cloneNativeBuffer());
    }

    public getWritable(): Writable {
        return new Writable({
            write: (chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) => {
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

    public getETag(): string {
        return Math.random().toString().replace(".", "");
    }

    public toString(): string {
        return "RamFile: " + this.getEntryName() + " (" + this.getSize() + " bytes), (" + this.getAbsolutePath() + ")";
    }

}