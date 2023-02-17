import { Readable } from 'stream';

export default class VoidWritableBuffer extends Readable {
    constructor() {
        super();
    }

    _read(size: number): void {
        this.push(null);
    }
}
