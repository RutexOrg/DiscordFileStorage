import DICloudApp from "../DICloudApp";
import MutableBuffer from "../helper/MutableBuffer";

import { createVFile, IFile } from "../file/IFile";
import { PassThrough, pipeline, Readable, Transform, Writable } from "stream";
import { gcm } from '@noble/ciphers/aes';
import { Cipher, utf8ToBytes } from '@noble/ciphers/utils';
import { withResolvers } from "../helper/utils";

import Log from "../Log";
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


    private createCipher(iv: Uint8Array): Cipher {
        const key = utf8ToBytes(this.client.getEncryptPassword());
        return gcm(key, iv);
    }

    private async createReadStreamWithDecryption(file: IFile): Promise<Readable> {
        const readStream = await this.createRawReadStream(file);
        const decipher = this.createCipher(file.iv);
        const decryptedRead = new PassThrough();

        const encryptedChunkSize = this.calculateSavedFileSize();
        const buffer = new MutableBuffer(encryptedChunkSize);


        readStream.on("data", (chunk) => {
            try {
                const left = encryptedChunkSize - buffer.size;

                if (chunk.length <= left) {
                    buffer.write(chunk);
                } else {
                    buffer.write(chunk.subarray(0, left));
                    const decrypted = decipher.decrypt(buffer.cloneNativeBuffer());
                    const writeSuccess = decryptedRead.write(decrypted);
                    if (!writeSuccess) {
                        readStream.pause();
                    }
                    buffer.clear();
                    buffer.write(chunk.subarray(left));
                }
            } catch (err) {
                decryptedRead.destroy(err instanceof Error ? err : new Error(String(err)));
                buffer.destroy();
            }
        });

        readStream.on("end", () => {
            try {
                if (buffer.size > 0) {
                    const decrypted = decipher.decrypt(buffer.cloneNativeBuffer());
                    decryptedRead.write(decrypted);
                }
                buffer.destroy();
                decryptedRead.end();
            } catch (err) {
                decryptedRead.destroy(err instanceof Error ? err : new Error(String(err)));
                buffer.destroy();
            }
        });

        decryptedRead.on("drain", () => {
            readStream.resume();
        });

        readStream.on("error", (err) => {
            decryptedRead.destroy(err);
            buffer.destroy();
        });

        decryptedRead.on("error", (err) => {
            readStream.destroy(err);
            buffer.destroy();
        });

        return decryptedRead;
    }


    private async createWriteStreamWithEncryption(file: IFile): Promise<Writable> {
        const rawWriteStream = await this.createRawWriteStream(file);
        const cipher = this.createCipher(file.iv);
        const writeStreamAwaiter = withResolvers();

        let buffer = new MutableBuffer(this.calculateProviderMaxSize());

        rawWriteStream.on("finish", () => {
            writeStreamAwaiter.resolve();
        });

        rawWriteStream.on("error", (err) => {
            writeStreamAwaiter.reject(err);
            buffer.destroy();
        });

        return new Writable({
            write: async (chunk: Buffer, encoding, callback) => {
                const left = this.calculateProviderMaxSize() - buffer.size;
                if (chunk.length <= left) {
                    buffer.write(chunk, encoding);
                } else {
                    buffer.write(chunk.subarray(0, left), encoding);
                    const f = buffer.flush();
                    const e = cipher.encrypt(f);
                    rawWriteStream.write(e);
                    buffer.clear();
                    buffer.write(chunk.subarray(left), encoding);
                }
                callback();
            },
            final: async (callback) => {
                Log.info("[BaseProvider] final() Finalizing upload.");
                if (buffer.size > 0) {
                    rawWriteStream.write(cipher.encrypt(buffer.flushAndDestory()));
                }
                rawWriteStream.end();
                await writeStreamAwaiter.promise; // we have to wait for rawWriteStream to finish, otherwise client will close connection too early thinking that upload is finished
                callback();
            },
            destroy: (err, callback) => {
                Log.info("[BaseProvider] destroy() Destroying write stream (error: " + err + ")");
                buffer.destroy();
                callback(err);
            }
        });

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


    /**
     * Custom provider should implement this method to provide max file size.
     */
    abstract calculateProviderMaxSize(): number;
    abstract calculateSavedFileSize(): number;


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