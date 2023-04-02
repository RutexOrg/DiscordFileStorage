import * as crypto from 'crypto';
import { Transform, Stream, Writable, Readable } from 'stream';

export interface AESStreamHelperOptions {
    password?: Buffer;
    algorithm?: string;
}

export default class AESStreamHelper {
    private password!: Buffer;
    private algorithm = 'aes-256-ctr';
    
    public constructor(params?: AESStreamHelperOptions){
        if (params && params.password) {
            this.password = params.password;
        }

        if (params && params.algorithm) {
            this.algorithm = params.algorithm;
        }
    }

    private fillOrTruncateString(str: string, w: string, length: number = 32): string {
        if (str.length > length) {
            return str.slice(0, length);
        } else {
            return str + w.repeat(length - str.length);
        }
    }

    public setPassword(p: string) {
        this.password = Buffer.from(this.fillOrTruncateString(p, '0'));
    }

    private checkPassword() {
        if (!this.password) {
            throw new Error('You should set password first.');
        }
    }

    public static generatePassword() {
        return crypto.randomBytes(32);
    }

    /**
     * Alias for generatePassword
     * @returns {Buffer} 32 bytes random buffer
     */
    public genPassword() {
        return AESStreamHelper.generatePassword();
    }


    public createEncryptStream(input: Stream): Stream {
        this.checkPassword();
        let passwordLocal =  this.password;
        const iv = crypto.randomBytes(16);
        const encryptStream = crypto.createCipheriv(this.algorithm, passwordLocal, iv);
        let inited: boolean = false;
        return input.pipe(encryptStream).pipe(new Transform({
            transform(chunk, encoding, callback) {
                if (!inited) {
                    inited = true;
                    this.push(Buffer.concat([iv, chunk]));
                } else {
                    this.push(chunk);
                }
                callback();
            }
        }));
    }

    public createDecryptStream(output: Writable): Transform {
        this.checkPassword();
        
        let iv: string;
        const passwordLocal =  this.password;
        const algoLocal = this.algorithm;
        return new Transform({
            transform(chunk, encoding, callback) {
                if (!iv) {
                    iv = chunk.slice(0, 16);
                    const decryptStream = crypto.createDecipheriv(algoLocal, passwordLocal, iv);
                    this.pipe(decryptStream).pipe(output);
                    this.push(chunk.slice(16));
                } else {
                    this.push(chunk);
                }
                callback();
            }
        })
    }

    public encryptChunk(chunk: Buffer): Buffer {
        this.checkPassword();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.password, iv);
        return Buffer.concat([iv, cipher.update(chunk), cipher.final()]);
    }

    


}

