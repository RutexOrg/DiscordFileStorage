import { AttachmentBuilder, TextChannel } from "discord.js";
import BaseProvider, { IWriteStreamCallbacks } from "../core/BaseProvider.js";
import HttpStreamPool from '../../stream-helpers/HttpStreamPool.js';
import structuredClone from "@ungap/structured-clone"; // polyfill for structured clone
import MutableBuffer from "../../helper/MutableBuffer.js";
import { Writable, Readable } from "stream";
import { truncate } from "../../helper/utils.js";
import { IFile } from "../../file/IFile.js";
import path from "path";

/**
 * Discord allows 10MB per file, so we need to split the file into chunks. 
 */
export const MAX_MB_CHUNK_SIZE = 10; // megabytes chunk size. Discord allows 10MB per file.
/**
 * Encryption overhead for AES-GCM is 16 bytes.
 */
export const ENCRYPTION_OVERHEAD = 16;
/**
 * Maximum chunk size in bytes. Total stored chunk will be SIZE + encryption overhead.
 */
export const MAX_REAL_CHUNK_SIZE = ( MAX_MB_CHUNK_SIZE * 1000 * 1000 ) - ENCRYPTION_OVERHEAD;

/**
 * Class that handles all the remote file management on discord.
 */
export default class DiscordFileProvider extends BaseProvider {

    // Function that returns a AttachmentBuilder from a buffer with proper name.
    private getAttachmentBuilderFromBuffer(buffer: Buffer, chunkName: string, chunkNummer: number = 0, addExtension: boolean = false, encrypt: boolean, extension: string = "txt",) : AttachmentBuilder {
        const builder = new AttachmentBuilder(buffer);
        const name = (chunkNummer ? chunkNummer + "-" : "") + chunkName + (addExtension ? "." + extension : "") + (encrypt ? ".enc" : "");

        builder.setName(name);
        return builder;
    }

    /**
     * Uploads a chunk to discord with a given naming and adds the chunk to the file object.
     * FLUSHES THE MUTABLE BUFFER!
     * @param chunk Buffer to upload
     * @param chunkNumber Chunk number (starts at 1)
     * @param totalChunks Total chunks, used only for logging, looks like is broken anyway at the moment
     * @param filesChannel Channel to upload the chunk to
     * @param file File that the chunk belongs to and will be added to after upload. 
     */
    private async uploadChunkToDiscord(chunk: MutableBuffer, chunkNumber: number, totalChunks: number, filesChannel: TextChannel, file: IFile) {
        this.client.getLogger().info(`[${file.name}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBuffer(chunk.flush(), path.parse(truncate(file.name, 15)).name, chunkNumber, false, this.client.shouldEncryptFiles())
            ],
        });

        this.client.getLogger().info(`[${file.name}] Chunk ${chunkNumber} of ${totalChunks} chunks added.`);
        file.chunks.push({
            id: message.id,
            url: message.attachments.first()!.url,
            size: chunk.size,
        });
        this.client.getLogger().info(file.chunks);
    }

    public async createRawReadStream(file: IFile): Promise<Readable> {
        this.client.getLogger().info(".getDownloadableReadStream() - file: " + file.name);
        return (await (new HttpStreamPool(structuredClone(file.chunks), file.size, file.name)).getDownloadStream());
    }

    public async createRawWriteStream(file: IFile, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        this.client.getLogger().info(".getUploadWritableStream() - file: " + file.name);

        const channel = this.client.getFilesChannel();
        const totalChunks = Math.ceil(file.size / MAX_REAL_CHUNK_SIZE);
        const buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);

        let chunkId = 1;

        return new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                // console.log("write() chunk.length: " + chunk.length + " - encoding: " + encoding);
                if (buffer.size + chunk.length > MAX_REAL_CHUNK_SIZE) {
                    await this.uploadChunkToDiscord(buffer, chunkId, totalChunks, channel, file);
                    if (callbacks.onChunkUploaded) {
                        await callbacks.onChunkUploaded(chunkId, totalChunks);
                    }
                    chunkId++;
                }
                file.size += chunk.length;
                buffer.write(chunk, encoding);
                callback();
            },
            final: async (callback) => {
                this.client.getLogger().info("final() Finalizing upload.");
                if (buffer.size > 0) {
                    await this.uploadChunkToDiscord(buffer, chunkId, totalChunks, channel, file);
                }

                this.client.getLogger().info("final() uploaded .")
                if (callbacks.onFinished) {
                    await callbacks.onFinished();
                }

                this.client.getLogger().info("final() write stream finished, onFinished() called.")
                callback();
            },
            destroy: (err, callback) => {
                this.client.getLogger().info("destroy() Destroying write stream (error: " + err + ")");
                buffer.destory();
                if (callbacks.onAbort) {
                    callbacks.onAbort(err);
                }
                callback(err);
            }
        });
    }

    public async processDeletionQueue(): Promise<void> {
        if (this.deletionQueue.length > 0) {
            const info = this.deletionQueue.shift()!;
            const channel = this.client.channels.cache.get(info.channel) as TextChannel;
            
            if (!channel) {
                this.client.getLogger().error("Failed to find channel: " + info.channel);
                return;
            }

            await channel.messages.delete(info.message);
        }
    }

    maxProviderFileSize(): number {
        return MAX_REAL_CHUNK_SIZE;
    }

    getMaxFileSizeWithOverhead(): number {
        return MAX_REAL_CHUNK_SIZE + ENCRYPTION_OVERHEAD
    }



}