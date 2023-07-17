import path from "path";
import { AttachmentBuilder, TextBasedChannel } from "discord.js";
import { Writable, Readable, Transform, pipeline } from "stream";
import DICloudApp from "../../DICloudApp.js";
import HttpStreamPool from '../../stream-helpers/HttpStreamPool.js';
import { IWriteStreamCallbacks } from "../core/IFileManager.js";
import MutableBuffer from "../../helper/MutableBuffer.js";
import crypto from "crypto";
import structuredClone from "@ungap/structured-clone"; // backport to nodejs 16
import { patchEmitter } from "../../helper/EventPatcher.js";
import { IFile } from "../../file/IFile.js";
import IProvider from "../core/IProvider.js";


export const MAX_REAL_CHUNK_SIZE: number = 25 * 1000 * 1000; // Looks like 25 mb is a new discord limit from 13.04.23 instead of 8 old MB. 

/**
 * Class that handles all the remote file management on discord.
 */
export default class DiscordFileProvider implements IProvider {
    private app: DICloudApp;

    constructor(client: DICloudApp) {
        this.app = client;
    }

    private getAttachmentBuilderFromBuffer(buff: Buffer, chunkName: string, chunkNummer: number = 0, addExtension: boolean = false, encrypt: boolean, extension: string = "txt",) {
        const builder = new AttachmentBuilder(buff);
        const name = (chunkNummer ? chunkNummer + "-" : "") + chunkName + (addExtension ? "." + extension : "") + (encrypt ? ".enc" : "");

        builder.setName(name);
        return builder;
    }

    private getAttachmentBuilderFromBufferWithoutExt(buff: Buffer, chunkName: string, chunkNummer: number = 0, encrypt: boolean, extension: string = "txt",) {
        return this.getAttachmentBuilderFromBuffer(buff, path.parse(chunkName).name, chunkNummer, false, encrypt, extension);
    }



    // truncates a string to a certain length. 
    // truncate("hello world", 5) => "hello",
    // truncate("hello world", 2) => "he"
    private truncate(str: string, n: number) {
        return (str.length > n) ? str.substr(0, n - 1) : str;
    }

    private async uploadFileChunkAndAttachToFile(buffer: MutableBuffer, chunkNumber: number, totalChunks: number, filesChannel: TextBasedChannel, file: IFile) {
        this.app.getLogger().info(`[${file.name}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBufferWithoutExt(buffer.flush(), this.truncate(file.name, 15), chunkNumber, this.app.shouldEncryptFiles())
            ],
        });

        this.app.getLogger().info(`[${file.name}] Chunk ${chunkNumber} of ${totalChunks} chunks added.`);
        file.chunks.push({
            id: message.id,
            url: message.attachments.first()!.url,
            size: buffer.size,
        });
        this.app.getLogger().info(file.chunks)
    }

    // reason: TypeError: authTagLength required for chacha20-poly1305
    private createDecryptor(autoDestroy = true) {
        const decipher = crypto.createDecipher("chacha20-poly1305", this.app.getEncryptPassword(), {
            autoDestroy,
            authTagLength: 16
        } as any);

        // backport to nodejs 16.14.2
        if(decipher.setAuthTag){
            decipher.setAuthTag(Buffer.alloc(16, 0));
        }

        decipher.once("error", (err) => { // TODO: debug error, for now just ignore, seems like md5 is normal.
            this.app.getLogger().info("Decipher", err);
        });

        return decipher;
    }

    private createEncryptor(autoDestroy = true) {
        const chiper = crypto.createCipher("chacha20-poly1305", this.app.getEncryptPassword(), {
            autoDestroy,
            authTagLength: 16
        } as any);


        chiper.once("error", (err) => {
            this.app.getLogger().info("Chiper", err);
        });

        return chiper;
    }

    public async getDownloadableReadStream(file: IFile): Promise<Readable> {
        this.app.getLogger().info(".getDownloadableReadStream() - file: " + file.name);
        const readStream = (await (new HttpStreamPool(structuredClone(file.chunks), file.size, file.name)).getDownloadStream());

        if (!this.app.shouldEncryptFiles()) {
            return readStream;
        }

        const decipher = this.createDecryptor();

        // calling .end on decipher stream will throw an error and not emit end event. so we need to do this manually. 
        decipher.once("unpipe", () => {
            patchEmitter(decipher, "decipher");
            patchEmitter(readStream, "read");
            setImmediate(() => { // idk if this work as it should... but looks like it does.
                decipher.emit("end");
                decipher.destroy();
            });
        });

        return readStream.pipe(decipher, { end: false });
    }


    public async getUploadWritableStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        this.app.getLogger().info(".getUploadWritableStream() - file: " + file.name);

        const size = file.size;
        const filesChannel = await this.app.getFileChannel();
        const totalChunks = Math.ceil(size / MAX_REAL_CHUNK_SIZE);
        const buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);

        let currentChunkNumber = 1;

        const write = new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                // console.log("write() chunk.length: " + chunk.length + " - encoding: " + encoding);
                if (buffer.size + chunk.length > MAX_REAL_CHUNK_SIZE) {
                    await this.uploadFileChunkAndAttachToFile(buffer, currentChunkNumber, totalChunks, filesChannel, file);
                    if (callbacks.onChunkUploaded) {
                        await callbacks.onChunkUploaded(currentChunkNumber, totalChunks);
                    }
                    currentChunkNumber++;
                }
                file.size += chunk.length;
                buffer.write(chunk, encoding);
                callback();
            },
            final: async (callback) => {
                this.app.getLogger().info("final() Finalizing upload.")
                if (buffer.size > 0) {
                    await this.uploadFileChunkAndAttachToFile(buffer, currentChunkNumber, totalChunks, filesChannel, file);
                }

                this.app.getLogger().info("final() uploaded .")
                if (callbacks.onFinished) {
                    await callbacks.onFinished();
                }

                this.app.getLogger().info("final() write stream finished, onFinished() called.")
                callback();
            }
        });

        if (!this.app.shouldEncryptFiles()) {
            return write;
        }


        // The problem is that the encryption stream is closing before the write stream is flushed all its data.
        // Since we give the encryption stream back and it closes too early, the write stream stream is not flushed all its data in discord, what results in a corrupted file or telling client at wrong time that the file is uploaded, when it is not. 
        // this is why we need to wait for the write stream to finish before we close the encryption stream.
        const cipher = this.createEncryptor(false);
        cipher.pipe(write);

        const pt = new Writable({
            write: (chunk, encoding, callback) => {
                cipher.write(chunk, encoding, callback);
            },
            final: (callback) => {
                cipher.end();
                write.once("finish", () => {
                    callback();
                });
            }
        });

        write.on("error", (err) => {
            this.app.getLogger().info("write.on('error')", err);
            pt.destroy(err);
            cipher.emit("end");
            cipher.destroy();
        });

        write.on("finish", () => {
            pt.end();
            cipher.emit("end");
            cipher.destroy();
        });

        return pt;
    }

}