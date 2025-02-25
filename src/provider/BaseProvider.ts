import DICloudApp from "../DICloudApp";
import MutableBuffer from "../helper/MutableBuffer";

import { createVFile, IFile } from "../file/IFile";
import { PassThrough, Readable, Transform, Writable, pipeline } from "stream";
import { withResolvers } from "../helper/utils";

import { scryptSync, randomFill, createCipheriv, createDecipheriv, CipherCCM, Cipher } from 'node:crypto';



import Log from "../Log";
import { patchEmitter } from "../helper/EventPatcher";
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

    public addToDeletionQueue(info: IDelayedDeletionEntry[]) {
        this.fileDeletionQueue.push(...info);
    }


    public get deletionQueue() {
        return this.fileDeletionQueue;
    }

    private getAlgorithm(): string {
        return "aes-256-gcm";
    }

    private createCipher(iv: Buffer): Cipher {
        const password = this.client.getEncryptPassword();
        const key = scryptSync(password, Buffer.alloc(16), 32);
        return createCipheriv(this.getAlgorithm(), key, iv);
    }

    private createDecipher(iv: Buffer): Cipher {
        const password = this.client.getEncryptPassword();
        const key = scryptSync(password, Buffer.alloc(16), 32);
        return createDecipheriv(this.getAlgorithm(), key, iv);
    }

    private async createReadStreamWithDecryption(file: IFile): Promise<Readable> {
        try {
            const decipher = this.createDecipher(file.iv);
            const stream = await this.createRawReadStream(file);
            
            const transform = new Transform({
                transform(chunk: Buffer, encoding, callback) {
                    // last chunk
                    if (chunk.length <= 16) {
                        this.push(null);
                        callback();
                        return;
                    }

                    this.push(decipher.update(chunk));
                    callback();
                },

                flush(callback) {
                    try {
                        const lastChunk = this.read();
                        if (!lastChunk) {
                            throw new Error('No auth tag found');
                        }

                        const authTag = lastChunk.subarray(-16);
                        const remainingData = lastChunk.subarray(0, lastChunk.length - 16);

                        (decipher as any).setAuthTag(authTag);
                        
                        if (remainingData.length > 0) {
                            this.push(decipher.update(remainingData));
                        }
                        this.push(decipher.final());
                        callback();
                    } catch (err) {
                        callback(err as Error);
                    }
                },
                highWaterMark: 64 * 1024
            });

            return pipeline(stream, transform, (err) => {
                if (err) transform.destroy(err);
            });

        } catch (err) {
            throw err;
        }
    }

    private async createWriteStreamWithEncryption(file: IFile): Promise<Writable> {
        try {
            const cipher = this.createCipher(file.iv);
            const stream = await this.createRawWriteStream(file);
            
            const wt = new Writable({
                write: (chunk, encoding, callback) => {
                    try {
                        const encrypted = cipher.update(chunk);
                        if (encrypted.length) {
                            // Handle backpressure by checking if write is successful
                            if (!stream.write(encrypted)) {
                                stream.once('drain', callback);
                            } else {
                                callback();
                            }
                        } else {
                            callback();
                        }
                    } catch (err: any) {
                        callback(err);
                    }
                },
                final: (callback) => {
                    try {
                        const final = cipher.final();
                        if (final.length) {
                            stream.write(final);
                        }
                        const authTag = (cipher as any).getAuthTag();
                        stream.write(authTag);
                        stream.end(callback);
                    } catch (err: any) {
                        callback(err);
                    }
                },
                highWaterMark: 64 * 1024
            });

            return wt;

        } catch (err) {
            throw err;
        }
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
    public abstract createRawWriteStream(file: IFile): Promise<Writable>;


    /* ----------------------------------------------------------------------------------------- */


    /**
     * Main method that should be used to download files from provider.
     * Creates read stream for downloading files from provider. Handles decryption if enabled.
     * Does not handle with any fs operations, only downloads from provider.
     * @param file 
     * @returns 
     */
    async createReadStream(file: IFile): Promise<Readable> {
        if (file.encrypted) {
            return await this.createReadStreamWithDecryption(file);
        }

        return await this.createRawReadStream(file);
    }

    /**
     * Main method that should be used to upload files to provider.
     * Creates write stream for uploading files to provider. Handles encryption if enabled.
     * Does not handle with any fs operations, only uploads to provider.
     * Mutates the file object (chunks and size)
     * @param file - file to upload
     * @param callbacks - callbacks for write stream. 
     * @returns write stream
     */
    async createWriteStream(file: IFile): Promise<Writable> {
        if (file.encrypted) {
            return await this.createWriteStreamWithEncryption(file);
        }

        return await this.createRawWriteStream(file);
    }

    /**
     * Convinient buffer upload function
     * @param buffer Buffer with file data
     * @param name Filename. Not really used, but can be used for logging or other purposes.
     * @returns created file struct with all data about file.
     */
    public async uploadFile(buffer: Buffer, name: string): Promise<IFile> {
        const file = createVFile(name, 0, this.client.shouldEncryptFiles());
        const stream = await this.createWriteStream(file);

        return new Promise(async (resolve, reject) => {
            stream.on("finish", () => {
                resolve(file);
            });

            stream.on("error", (err) => {
                reject(err);
            });
            Readable.from(buffer).pipe(stream);
        });
    }

    /**
     * Convinient download function that downloads file from provider and returns it as buffer.
     * @param file valid file struct
     * @returns Buffer with file data
     */
    public async downloadFile(file: IFile): Promise<Buffer> {
        const stream = await this.createReadStream(file);
        const size = file.encrypted ? file.size - (16 * file.chunks.length) : file.size;

        return new Promise((resolve, reject) => {
            const buffer = new MutableBuffer(size);
            stream.on("data", (chunk) => {
                buffer.write(chunk)
            });

            stream.on("end", () => {
                resolve(buffer.flushAndDestory());
            });

            stream.on("error", (err) => {
                buffer.destroy();
                reject(err);
            });
        });
    }

}