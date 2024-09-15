import { IFile } from "../../file/IFile";
import { PassThrough, Readable, Transform, Writable } from "stream";
import DICloudApp from "../../DICloudApp";

import { gcm } from '@noble/ciphers/aes';
import { Cipher, utf8ToBytes } from '@noble/ciphers/utils';
import { randomBytes } from '@noble/ciphers/webcrypto';

import MutableBuffer from "../../helper/MutableBuffer";
import { withResolvers } from "../../helper/utils";

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

  
    private createCipher(iv: Uint8Array): Cipher {
        const key = utf8ToBytes(this.client.getEncryptPassword());
        return gcm(key, iv);
    }

    private async createReadStreamWithDecryption(file: IFile): Promise<Readable> {
        const readStream = await this.createRawReadStream(file);
        const decipher = this.createCipher(file.iv);

        const decryptedRead = new PassThrough();    
        const buffer = new MutableBuffer(this.calculateSavedFileSize()); // encrypted data is bigger than decrypted data   
    
        readStream.on("data", (chunk) => {
            const left = this.calculateSavedFileSize() - buffer.size;
            if (chunk.length <= left) {
                buffer.write(chunk);
            } else {
                buffer.write(chunk.slice(0, left));
                const decrypted = decipher.decrypt(buffer.cloneNativeBuffer());
                decryptedRead.push(decrypted);
                buffer.clear();
                buffer.write(chunk.slice(left));
            }
        });
    
        readStream.on("end", () => {
            if (buffer.size > 0) {
                const decrypted = decipher.decrypt(buffer.cloneNativeBuffer());
                decryptedRead.push(decrypted);
            }
            decryptedRead.push(null);
            buffer.destory();
        });
    
        readStream.on("error", (err) => {
            decryptedRead.destroy(err);
            buffer.destory();
        });
    
        return decryptedRead;
    }

    private async createWriteStreamWithEncryption(file: IFile): Promise<Writable> {
        const rawWriteStream = await this.createRawWriteStream(file);
        const cipher = this.createCipher(file.iv);
        const writeStreamAwaiter = withResolvers();
        
        const buffer = new MutableBuffer(this.calculateProviderMaxSize());

        rawWriteStream.on("finish", () => {
            writeStreamAwaiter.resolve();
        });

        rawWriteStream.on("error", (err) => {
            writeStreamAwaiter.reject(err);
            buffer.destory();
        });

        return new Writable({
            write: async (chunk: Buffer, encoding, callback) => {
                // console.log("[BaseProvider] write() chunk.length: " + chunk.length + " - encoding: " + encoding);
                const left = this.calculateProviderMaxSize() - buffer.size;
                if (chunk.length <= left) {
                    buffer.write(chunk, encoding);
                } else {
                    buffer.write(chunk.subarray(0, left), encoding);
                    rawWriteStream.write(cipher.encrypt(buffer.flush()));
                    buffer.clear();
                    buffer.write(chunk.subarray(left), encoding);
                }
                callback();
            },
            final: async (callback) => {
                console.log("[BaseProvider] final() Finalizing upload.");
                if (buffer.size > 0) {
                    rawWriteStream.write(cipher.encrypt(buffer.flushAndDestory()));
                }
                rawWriteStream.end();
                await writeStreamAwaiter.promise;
                callback();
            },
            destroy: (err, callback) => {
                console.log("[BaseProvider] destroy() Destroying write stream (error: " + err + ")");
                buffer.destory();
                callback(err);
            }
        });

    }

    /**
     * Returns file struct, no remote operations are done.
     */
    public createVFile(name: string, size: number = 0): IFile {
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
     * Mutates the file object (chunks and size)
     * @param file - file to upload
     * @param callbacks - callbacks for write stream. 
     * @returns write stream
     */
    async createWriteStream(file: IFile): Promise<Writable> {
        if (this.client.shouldEncryptFiles()) {
            return await this.createWriteStreamWithEncryption(file);
        } else {
            return await this.createRawWriteStream(file);
        }
    }
    
    /**
     * 
     * @param buffer Convinient buffer upload function
     * @param name Filename. Not really used, but can be used for logging or other purposes.
     * @returns created file struct with all data about file.
     */
    public async uploadFile(buffer: Buffer, name: string): Promise<IFile> {
        const promise = withResolvers();
        const file = this.createVFile(name);
        const stream = await this.createWriteStream(file);

        stream.on("finish", () => {
            promise.resolve(file);
        });

        stream.on("error", (err) => {
            promise.reject(err);
        });

        stream.write(buffer);
        stream.end();
        await promise.promise;

        return file;
    }

    /**
     * Convinient download function that downloads file from provider and returns it as buffer. Uses buffer.
     * @param file valid file struct
     * @returns Buffer with file data
     */
    public async downloadFile(file: IFile): Promise<Buffer> {
        const stream = await this.createReadStream(file);
        const size = this.client.shouldEncryptFiles() ? file.size - (16 * file.chunks.length) : file.size;

        return new Promise((resolve, reject) => {
            const buffer = new MutableBuffer(size);
            stream.on("data", (chunk) => {
                buffer.write(chunk)
            });

            stream.on("end", () => {
                resolve(buffer.flushAndDestory());
            });

            stream.on("error", (err) => {
                buffer.destory();
                reject(err);
            });
        });
    }
        
}