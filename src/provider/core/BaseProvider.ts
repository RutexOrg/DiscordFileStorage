// import crypto from "crypto";
import { IFile } from "../../file/IFile";
import { PassThrough, Readable, Transform, Writable } from "stream";
import DICloudApp from "../../DICloudApp";

import { gcm } from '@noble/ciphers/aes';
import { Cipher, utf8ToBytes } from '@noble/ciphers/utils';
import { randomBytes } from '@noble/ciphers/webcrypto';

import { bytesToUtf8 } from '@noble/ciphers/utils';

import MutableBuffer from "../../helper/MutableBuffer";
import { withResolvers } from "../../helper/utils";


export interface IWriteStreamCallbacks {
    onFinished?: () => Promise<void>;
    onChunkUploaded?: (chunkNumber: number, totalChunks: number) => Promise<void>;
    onAbort?: (error: Error | null) => void;
}

export interface IDelayedDeletionEntry {
    channel: string;
    message: string;
}

export default abstract class BaseProvider {
    private _app: DICloudApp;
    private fileDeletionQueue: Array<IDelayedDeletionEntry> = [];

    public constructor(app: DICloudApp) {
        this._app = app;
    }

    public get client() {
        return this._app;
    }

    public addToDeletionQueue(info: IDelayedDeletionEntry) {
        this.fileDeletionQueue.push(info);
    }

    public get deletionQueue() {
        return this.fileDeletionQueue;
    }

    /**
     * Method that should be used to implement queue for deleting files from provider. Queue is used to prevent ratelimiting and other blocking issues.
     */
    public abstract processDeletionQueue(): Promise<void>;
        
    /**
     * Method that should provide raw read stream for downloading files from provider. Only basic read stream from provider, no decryption or anything else.
     * @param file - File which should be downloaded.
     */
    public abstract createRawReadStream(file: IFile): Promise<Readable>;
    /**
     * Method that should provide raw write stream for uploading files to provider. Only basic write stream to provider, no encryption or anything else.
     * @param file - File which should be uploaded.
     * @param callbacks  - Callbacks for write stream.
     */
    public abstract createRawWriteStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable>;

    private createCipher(iv: Uint8Array): Cipher {
        const key = utf8ToBytes(this.client.getEncryptPassword());
        return gcm(key, iv);
    }

    private async createReadStreamWithDecryption(file: IFile): Promise<Readable> {
        const readStream = await this.createRawReadStream(file);
        const decipher = this.createCipher(file.iv);
    
        const decryptedRead = new PassThrough();
    
        const buffer = new MutableBuffer(this.getMaxFileSizeWithOverhead());    
        const processBuffer = (chunk: any) => {
            const rest = this.getMaxFileSizeWithOverhead() - buffer.size;
            if (chunk.length < rest) {
                buffer.write(chunk);
            } else {
                buffer.write(chunk.slice(0, rest));
                const decrypted = decipher.decrypt(buffer.cloneNativeBuffer());
                decryptedRead.push(decrypted);
                buffer.clear();
                buffer.write(chunk.slice(rest));
            }
        };
    
        readStream.on("data", (chunk) => {
            processBuffer(chunk);
        });
    
        readStream.on("end", () => {
            if (buffer.size > 0) {
                const decrypted = decipher.decrypt(buffer.cloneNativeBuffer());
                decryptedRead.push(decrypted);
            }
            decryptedRead.push(null);
        });
    
        readStream.on("error", (err) => {
            decryptedRead.destroy(err);
        });
    
        return decryptedRead;
    }

    private async createWriteStreamWithEncryption(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        const stream = await this.createRawWriteStream(file, callbacks);
        const cipher = this.createCipher(file.iv);
        const writeStreamAwaiter = withResolvers();

        stream.on("finish", () => {
            writeStreamAwaiter.resolve();
        });

        stream.on("error", (err) => {
            writeStreamAwaiter.reject(err);
        });

        const buffer = new MutableBuffer(this.maxProviderFileSize());
        return new Writable({
            write: async (chunk: Buffer, encoding, callback) => {
                // console.log("[BaseProvider] write() chunk.length: " + chunk.length + " - encoding: " + encoding);
                const rest = this.maxProviderFileSize() - buffer.size;
                if (chunk.length < rest) {
                    buffer.write(chunk, encoding);
                } else {
                    buffer.write(chunk.subarray(0, rest), encoding);
                    stream.write(cipher.encrypt(buffer.flush()));
                    buffer.clear();
                    buffer.write(chunk.subarray(rest), encoding);
                }
                callback();
            },
            final: async (callback) => {
                console.log("[BaseProvider] final() Finalizing upload.");
                if (buffer.size > 0) {
                    stream.write(cipher.encrypt(buffer.flush()));
                }
                stream.end();
                await writeStreamAwaiter.promise;
                callback();
            },
            destroy: (err, callback) => {
                console.log("[BaseProvider] destroy() Destroying write stream (error: " + err + ")");
                buffer.destory();
                if (callbacks.onAbort) {
                    callbacks.onAbort(err);
                }
                callback(err);
            }
        });

    }


    /**
     * Main method that should be used to download files from provider.
     * Creates read stream for downloading files from provider. Handles decryption if enabled.
     * Does not handle with any fs operations, only downloads from provider.
     * @param file 
     * @returns 
     */
    async createReadStream(file: IFile): Promise<Readable> {
        if (this.client.shouldEncryptFiles()) {
            return await this.createReadStreamWithDecryption(file);
        } else {
            return await this.createRawReadStream(file);
        }
    }

    /**
     * Main method that should be used to upload files to provider.
     * Creates write stream for uploading files to provider. Handles encryption if enabled.
     * Does not handle with any fs operations, only uploads to provider.
     * @param file - file to upload
     * @param callbacks - callbacks for write stream. 
     * @returns write stream
     */
    async createWriteStream(file: IFile, callbacks?: IWriteStreamCallbacks): Promise<Writable> {
        if (this.client.shouldEncryptFiles()) {
            return await this.createWriteStreamWithEncryption(file, callbacks || {});
        } else {
            return await this.createRawWriteStream(file, callbacks || {});
        }
    }

    /**
     * Returns file struct, no remote operations are done.
     */
    public createVFile(name: string, size: number): IFile {
        return {
            name,
            size,
            chunks: [],
            created: new Date(),
            modified: new Date(),
            iv: randomBytes(),
        };
    }

    /**
     * Custom provider should implement this method to provide max file size.
     */
    abstract maxProviderFileSize(): number;
    abstract getMaxFileSizeWithOverhead(): number;
}