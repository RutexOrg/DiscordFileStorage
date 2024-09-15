import { AttachmentBuilder, TextChannel } from "discord.js";
import BaseProvider from "../core/BaseProvider.js";
import HttpStreamPool from '../../stream-helpers/HttpStreamPool.js';
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
 * Maximum chunk size in bytes minus encryption overhead. 
 * Total stored chunk will be SIZE + encryption overhead.
 */
export const MAX_REAL_CHUNK_SIZE = (MAX_MB_CHUNK_SIZE * 1000 * 1000) - ENCRYPTION_OVERHEAD;

/**
 * Class that handles all the remote file management on discord.
 */
export default class DiscordFileProvider extends BaseProvider {

    // Function that returns a AttachmentBuilder from a buffer with proper name.
    private getAttachmentBuilderFromBuffer(buffer: Buffer, chunkName: string, chunkNummer: number = 0, addExtension: boolean = false, encrypt: boolean, extension: string = "txt",): AttachmentBuilder {
        const builder = new AttachmentBuilder(buffer);
        const name = (chunkNummer ? chunkNummer + "-" : "") + chunkName + (addExtension ? "." + extension : "") + (encrypt ? ".enc" : "");

        builder.setName(name);
        return builder;
    }

    /**
     * Uploads a chunk to discord with a given naming and adds the chunk to the file object.
     * FLUSHES THE MUTABLE BUFFER! Mutates the buffer and the file object.
     * @param chunk Buffer to upload
     * @param chunkNumber Chunk number (starts at 1)
     * @param filesChannel Channel to upload the chunk to
     * @param file File that the chunk belongs to and will be added to after upload. 
     */
    private async uploadChunkToDiscord(chunk: MutableBuffer, chunkNumber: number, filesChannel: TextChannel, file: IFile) {
        this.client.getLogger().info(`[${file.name}] Uploading chunk ${chunkNumber}....`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBuffer(chunk.flush(), path.parse(truncate(file.name, 15)).name, chunkNumber, false, this.client.shouldEncryptFiles())
            ],
        });

        file.chunks.push({
            id: message.id,
            // url: message.attachments.first()!.id,
            size: chunk.size,
        });
        this.client.getLogger().info(`[${file.name}] Chunk ${chunkNumber} added.`);
    }

    public async createRawReadStream(file: IFile): Promise<Readable> {
        this.client.getLogger().info(".createRawReadStream() - file: " + file.name);
        return (await (new HttpStreamPool(file).getDownloadStream(async (id) => {
            return (await this.client.getFilesChannel().messages.fetch(id)).attachments.first()!.url; // we need to resolve id -> url, since discord updates urls.
        })));
    }

    public async createRawWriteStream(file: IFile): Promise<Writable> {
        this.client.getLogger().info(".createRawWriteStream() - file: " + file.name);

        const channel = this.client.getFilesChannel();
        const buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);

        let chunkId = 1;
        const self = this;
        return new Writable({
            write: async function (chunk, encoding, callback) { // write is called when a chunk of data is ready to be written to stream.
                const left = MAX_REAL_CHUNK_SIZE - buffer.size;

                if (chunk.length <= left) {
                    buffer.write(chunk, encoding);
                } else {
                    buffer.write(chunk.slice(0, left), encoding);
                    await self.uploadChunkToDiscord(buffer, chunkId, channel, file);
                    this.emit("chunkUploaded", chunkId);
                    chunkId++;
                    buffer.write(chunk.slice(left), encoding);
                }

                file.size += chunk.length;
                callback()

            },
            final: async (callback) => {
                this.client.getLogger().info("final() Finalizing upload.");
                if (buffer.size > 0) {
                    await this.uploadChunkToDiscord(buffer, chunkId, channel, file);
                }
                buffer.destory();
                this.client.getLogger().info("final() write stream finished, onFinished() called.")
                callback();
            },
            destroy: (err, callback) => {
                this.client.getLogger().info("destroy() Destroying write stream (error: " + err + ")");
                buffer.destory();
                callback(err);
            }
        });
    }

    public async processDeletionQueue(): Promise<void> {
        if (this.deletionQueue.length > 0) {
            const info = this.deletionQueue.shift()!;
            const channel = this.client.getDiscordClient().channels.cache.get(info.channel) as TextChannel;

            if (!channel) {
                this.client.getLogger().error("Failed to find channel: " + info.channel);
                return;
            }

            await channel.messages.delete(info.message);
        }
    }

    calculateProviderMaxSize(): number {
        return MAX_REAL_CHUNK_SIZE;
    }

    calculateSavedFileSize(): number {
        return MAX_REAL_CHUNK_SIZE + ENCRYPTION_OVERHEAD
    }



}