import { Writable } from 'stream';
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