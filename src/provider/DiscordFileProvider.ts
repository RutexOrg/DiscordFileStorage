import path from "path";
import BaseProvider from "./BaseProvider.js";
import HttpStreamPool from '../HttpStreamPool.js';

import { AttachmentBuilder, TextChannel } from "discord.js";
import { Writable, Readable, PassThrough } from "stream";
import { splitBufferBy, truncate } from "../helper/utils.js";
import { IFile } from "../file/IFile.js";

import Log from "../Log.js";
import MutableBuffer from "../helper/MutableBuffer.js";

export const MAX_MB_CHUNK_SIZE = 10; // megabytes chunk size. Discord allows 10MB per file.
export const ENCRYPTION_OVERHEAD = 16; // 16 bytes for encryption metadata

export const MAX_CHUNK_SIZE = (MAX_MB_CHUNK_SIZE * 1000 * 1000) - ENCRYPTION_OVERHEAD;

export default class DiscordFileProvider extends BaseProvider {
    
    private getAttachmentBuilderFromBuffer(stream: Buffer, chunkName: string, chunkNumber: number = 0, addExtension: boolean = false, encrypt: boolean, extension: string = "txt"): AttachmentBuilder {
        return new AttachmentBuilder(stream, {
            name: (chunkNumber ? chunkNumber + "-" : "") + chunkName + (addExtension ? "." + extension : "") + (encrypt ? ".enc" : "")
        });
    }

    private async uploadChunkToDiscord(buf: MutableBuffer, chunkNumber: number, filesChannel: TextChannel, file: IFile) {
        Log.info(`[${file.name}] Uploading chunk ${chunkNumber}....`);
        const size = buf.size;
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBuffer(
                    buf.flush(),
                    path.parse(truncate(file.name, 15)).name,
                    chunkNumber,
                    false,
                    file.encrypted
                )
            ],
        });

        file.chunks.push({
            id: message.id,
            size,
        });
        Log.info(`[${file.name}] Chunk ${chunkNumber} added.`);
    }

    public async createRawReadStream(file: IFile): Promise<Readable> {
        Log.info(".createRawReadStream() - file: " + file.name);
        return (await (new HttpStreamPool(file).getDownloadStream(async (id) => {
            return (await this.client.getFilesChannel().messages.fetch(id)).attachments.first()!.url;
        })));
    }

    /**
     * Updates the file size and chunk size.
     */
    public async createRawWriteStream(file: IFile): Promise<Writable> {
        Log.info(".createRawWriteStream() - file: " + file.name);
        
        const channel = this.client.getFilesChannel();
        let chunkId = 1;
        let chunkBuffer = new MutableBuffer();
        let totalFileSize = 0;

        const uploadStream = new Writable({
            write: async (chunk_: Buffer, encoding: BufferEncoding, callback) => {
                for (const chunk of splitBufferBy(chunk_, MAX_CHUNK_SIZE)) {  // in case the chunk is too big
                    if(chunkBuffer.size + chunk.length > MAX_CHUNK_SIZE) {
                        const left = MAX_CHUNK_SIZE - chunkBuffer.size;
                        const slice = chunk.slice(0, left);
                        chunkBuffer.write(slice, encoding);
                        await this.uploadChunkToDiscord(chunkBuffer, chunkId, channel, file);
                        chunkBuffer.destroy();
                        chunkBuffer = new MutableBuffer();
                        chunkBuffer.write(chunk.slice(left), encoding);
                        chunkId++;
                    } else {
                        chunkBuffer.write(chunk);
                    }
                    totalFileSize += chunk.length;
                }
                callback();
            },
            final: async (callback) => {
                Log.info("[DiscordProvider] final() Finalizing upload.");
                if (chunkBuffer.size > 0) {
                    await this.uploadChunkToDiscord(chunkBuffer, chunkId, channel, file);
                    chunkBuffer.destroy();
                }
                file.size = totalFileSize;
                callback();
            }
        });
    
        return uploadStream;
    }

    public async processDeletionQueue(): Promise<void> {
        if (this.deletionQueue.length > 0) {
            const info = this.deletionQueue.shift()!;
            const channel = this.client.getDiscordClient().channels.cache.get(info.channel) as TextChannel;

            if (!channel) {
                Log.error("Failed to find channel: " + info.channel);
                return;
            }
            try {
                await channel.messages.delete(info.message);
            } catch (e) {
                Log.error(e);
                Log.error("Failed to delete message: " + info.message + " in channel: " + info.channel);
            }
        }
    }

    calculateProviderMaxSize(): number {
        return MAX_CHUNK_SIZE;
    }

    calculateSavedFileSize(): number {
        return MAX_CHUNK_SIZE + ENCRYPTION_OVERHEAD;
    }
}
