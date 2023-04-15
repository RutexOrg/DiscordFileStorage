import { Hash, createHash } from 'crypto';


/**
 * class that accept any number of random buffers and returns a hash of them
 */
export class ETagHasher {
   
    private hash: string = "";
    private hashObject: Hash;

    constructor() {
        this.hashObject = createHash('sha256');
    }

    public modifyHash(buffer: Buffer): void {
        this.hashObject.update(buffer);
    }

    public finalize(): string {
        if (this.hash === "") {
            this.hash = this.hashObject.digest('hex');
        }
        return this.hash;
    }
    
}