import path from "path";
import { AttachmentBuilder, TextBasedChannel } from "discord.js";
import { Writable, Readable, Transform, pipeline } from "stream";
import DiscordFileStorageApp from "./DiscordFileStorageApp.js";
import HttpStreamPool from './stream-helpers/HttpStreamPool.js';
import RemoteFile, { IChunkInfo } from './file/RemoteFile.js';
import IFIleManager, { IUploadResult, IWriteStreamCallbacks } from "./IFileManager.js";
import MutableBuffer from "./helper/MutableBuffer.js";
import crypto from "crypto";
import structuredClone from "@ungap/structured-clone"; // backport to nodejs 16
import { patchEmitter } from "./helper/EventPatcher.js";


export const MAX_REAL_CHUNK_SIZE: number = 25 * 1000 * 1000; // Looks like 25 mb is a new discord limit from 13.04.23 instead of 8 old MB. 

/**
 * Class that handles all the remote file management on discord.
 */
export default class DiscordFileManager implements IFIleManager {
    private app: DiscordFileStorageApp;

    constructor(client: DiscordFileStorageApp) {
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

    public async postMetaFile(file: RemoteFile): Promise<IUploadResult> {
        const metaChannel = await this.app.getMetadataChannel();

        let msg = await metaChannel.send("Uploading file meta...");
        this.app.getLogger().info(".postMetaFile() - msg.id: " + msg.id + " - file: " + file.getFileName());
        file.setMessageMetaIdInMetaChannel(msg.id);

        await msg.edit({
            content: ":white_check_mark: File meta posted successfully.",
            files: [this.getAttachmentBuilderFromBuffer(Buffer.from(file.toJson()), file.getFileName(), 0, true, false)],
        });

        return {
            message: "File meta posted successfully.",
            success: true,
            file,
        }
    }

    public async updateMetaFile(file: RemoteFile): Promise<IUploadResult> {
        this.app.getLogger().info(".updateMetaFile() - file: " + file.getFileName(), file.toString());
        if (!file.isUploaded()) {
            throw new Error("File is not valid: seems like it was not uploaded to discord yet.");
        }

        file.updateModifyDate();

        const metaChannel = await this.app.getMetadataChannel();
        const msg = await metaChannel.messages.fetch(file.getMessageMetaIdInMetaChannel());

        await msg.edit({
            content: ":white_check_mark: :white_check_mark: File info updated successfully.",
            files: [this.getAttachmentBuilderFromBuffer(Buffer.from(file.toJson()), file.getFileName(), 0, true, false)],
        });

        return {
            message: "File meta updated successfully.",
            success: true,
            file,
        }
    }


    // truncates a string to a certain length. 
    // truncate("hello world", 5) => "hello",
    // truncate("hello world", 2) => "he"
    private truncate(str: string, n: number) {
        return (str.length > n) ? str.substr(0, n - 1) : str;
    }

    private async uploadFileChunkAndAttachToFile(buffer: MutableBuffer, chunkNumber: number, totalChunks: number, filesChannel: TextBasedChannel, file: RemoteFile) {
        this.app.getLogger().info(`[${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBufferWithoutExt(buffer.flush(), this.truncate(file.getFileName(), 15), chunkNumber, this.app.shouldEncryptFiles())
            ],
        });

        this.app.getLogger().info(`[${file.getFileName()}] Chunk ${chunkNumber} of ${totalChunks} chunks added.`);
        file.addChunk({
            id: message.id,
            url: message.attachments.first()!.url,
            proxyUrl: message.attachments.first()!.proxyURL,
            length: buffer.size,
        });
        this.app.getLogger().info(file.getChunks())
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

    public async getDownloadableReadStream(file: RemoteFile): Promise<Readable> {
        this.app.getLogger().info(".getDownloadableReadStream() - file: " + file.getFileName());
        const readStream = (await (new HttpStreamPool(structuredClone(file.getChunks()), file.getSize(), file.getEntryName())).getDownloadStream());

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


    public async getUploadWritableStream(file: RemoteFile, size: number, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        this.app.getLogger().info(".getUploadWritableStream() - file: " + file.getFileName());

        const filesChannel = await this.app.getFileChannel();
        const totalChunks = Math.ceil(size / MAX_REAL_CHUNK_SIZE);
        const buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);


        let currentChunkNumber = 1;

        file.setFilesPostedInChannelId(filesChannel.id);


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


    public async deleteFile(file: RemoteFile, awaitForChunksDelete: boolean = true): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();
        const metadataChannel = await this.app.getMetadataChannel();
        const chunks = file.getChunks();

        const metadataMessage = await metadataChannel.messages.fetch(file.getMessageMetaIdInMetaChannel());
        await metadataMessage.edit(":x: File is deleted. " + chunks.length + " chunks will be deleted....");

     
        for (let i = 0; i < chunks.length; i++) {
            const attachmentInfo = chunks[i];
            const message = await filesChannel.messages.fetch(attachmentInfo.id); // TODO: delete without fetching?
            await message.delete();
        }

        await metadataMessage.delete();
        file.markDeleted();



        return {
            success: true,
            message: "File deleted successfully.",
            file,
        }
    }

    public async deleteChunks(chunks: IChunkInfo[]): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();

        for (let i = 0; i < chunks.length; i++) {
            const attachmentInfo = chunks[i];
            const message = await filesChannel.messages.fetch(attachmentInfo.id);
            await message.delete();
        }

        return {
            success: true,
            message: "File deleted successfully.",
            file: null,
        }
    }

    public async renameFile(file: RemoteFile, newName: string): Promise<IUploadResult> {
        file.setFileName(newName);
        await this.updateMetaFile(file);

        return {
            success: true,
            message: "File renamed successfully.",
            file,
        }
    }

}