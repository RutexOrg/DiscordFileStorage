import crypto from "crypto";
import { IChunkInfo, IFile } from "../../file/IFile";
import { Readable, Writable } from "stream";
import DICloudApp from "../../DICloudApp";
import { patchEmitter } from "../../helper/EventPatcher.js";

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


    private createEncryptor(autoDestroy = true) {
        const chiper = crypto.createCipher("chacha20-poly1305", this.client.getEncryptPassword(), {
            autoDestroy,
            authTagLength: 16
        } as any);


        chiper.once("error", (err) => {
            this.client.getLogger().info("Chiper", err);
        });

        return chiper;
    }

    // reason: TypeError: authTagLength required for chacha20-poly1305
    private createDecryptor(autoDestroy = true) {
        const decipher = crypto.createDecipher("chacha20-poly1305", this.client.getEncryptPassword(), {
            autoDestroy,
            authTagLength: 16
        } as any);

        // backport to nodejs 16.14.2
        if (decipher.setAuthTag) {
            decipher.setAuthTag(Buffer.alloc(16, 0));
        }

        decipher.once("error", (err) => { // TODO: debug error, for now just ignore, seems like md5 is normal.
            this.client.getLogger().info("Decipher", err);
        });

        return decipher;
    }

    private async createReadStreamWithDecryption(file: IFile): Promise<Readable> {
        const stream = await this.createRawReadStream(file);
        const decipher = this.createDecryptor();

        // calling .end on decipher stream will throw an error and not emit end event. so we need to do this manually. 
        decipher.once("unpipe", () => {
            // patchEmitter(decipher, "decipher"); // debug 
            // patchEmitter(stream, "read"); // debug
            setImmediate(() => { // idk if this work as it should... but looks like it does.
                decipher.emit("end");
                decipher.destroy();
            });
        });

        return stream.pipe(decipher, { end: false });
    }

    private async createWriteStreamWithEncryption(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        const stream = await this.createRawWriteStream(file, callbacks);
        const cipher = this.createEncryptor(false);

        // The problem is that the encryption stream is closing before the write stream is flushed all its data.
        // Since we give the encryption stream back and it closes too early, the write stream stream is not flushed all its data in provider, what results in a corrupted file or telling client at wrong time that the file is uploaded, when it is not. 
        // this is why we need to wait for the write stream to finish before we close the encryption stream.
        cipher.pipe(stream);

        const pt = new Writable({
            write: (chunk, encoding, callback) => {
                cipher.write(chunk, encoding, callback);
            },
            final: (callback) => {
                cipher.end();
                stream.once("finish", () => {
                    callback();
                });
            }
        });

        stream.on("error", (err) => {
            this.client.getLogger().info("write.on('error')", err);
            pt.destroy(err);
            cipher.emit("end");
            cipher.destroy();
        });

        stream.on("finish", () => {
            pt.end();
            cipher.emit("end");
            cipher.destroy();
        });

        return pt;
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
    async createWriteStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        if (this.client.shouldEncryptFiles()) {
            return await this.createWriteStreamWithEncryption(file, callbacks);
        } else {
            return await this.createRawWriteStream(file, callbacks);
        }
    }

    public createVFile(name: string, size: number): IFile {
        return {
            name,
            size,
            chunks: [],
            created: new Date(),
            modified: new Date()
        };
    }
}