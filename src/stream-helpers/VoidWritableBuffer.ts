import { Writable } from 'stream';

/**
 * Class that deletes all data written to it. Temponary dummy class for discarding data. 
 */
export default class VoidWritableBuffer extends Writable {
    constructor() {
        super();
    }

    _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
        callback();
    }
}