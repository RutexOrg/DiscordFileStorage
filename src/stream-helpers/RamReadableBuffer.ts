import { Writable } from 'stream';

/**
 * A Writable stream class that stores all data in a buffer. Useful for storing data in memory.
 * At the moment used as a dummy placeholder for the upload stream in RemoteFileManager, since fully implementation of VirtualDiscordFileSystem isnt done yet.
 */
export default class RamReadableBuffer extends Writable {
    private buffer: Buffer;
    constructor() {
        super();
        this.buffer = Buffer.alloc(0);
    }

    _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        callback();
    }

    public getBuffer(): Buffer {
        return this.buffer;
    }

    


}