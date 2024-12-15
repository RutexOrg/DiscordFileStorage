import { AttachmentBuilder, TextChannel } from "discord.js";
import BaseProvider from "../core/BaseProvider.js";
import HttpStreamPool from '../../stream-helpers/HttpStreamPool.js';
import { Writable, Readable, PassThrough } from "stream";
import { truncate } from "../../helper/utils.js";
import { IFile } from "../../file/IFile.js";
import path from "path";
import Log from "../../Log.js";

export const MAX_MB_CHUNK_SIZE = 10; // megabytes chunk size. Discord allows 10MB per file.
export const ENCRYPTION_OVERHEAD = 16; // 16 bytes for encryption metadata

export const MAX_REAL_CHUNK_SIZE = (MAX_MB_CHUNK_SIZE * 1000 * 1000) - ENCRYPTION_OVERHEAD;

export default class DiscordFileProvider extends BaseProvider {
    private getAttachmentBuilderFromStream(stream: Readable, chunkName: string, chunkNumber: number = 0, addExtension: boolean = false, encrypt: boolean, extension: string = "txt"): AttachmentBuilder {
        return new AttachmentBuilder(stream, {
            name: (chunkNumber ? chunkNumber + "-" : "") + chunkName + (addExtension ? "." + extension : "") + (encrypt ? ".enc" : "")
        });
    }

    private async uploadChunkToDiscord(stream: Readable, chunkNumber: number, filesChannel: TextChannel, file: IFile) {
        Log.info(`[${file.name}] Uploading chunk ${chunkNumber}....`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromStream(
                    stream,
                    path.parse(truncate(file.name, 15)).name,
                    chunkNumber,
                    false,
                    this.client.shouldEncryptFiles()
                )
            ],
        });

        file.chunks.push({
            id: message.id,
            size: MAX_REAL_CHUNK_SIZE,
        });
        Log.info(`[${file.name}] Chunk ${chunkNumber} added.`);
    }

    public async createRawReadStream(file: IFile): Promise<Readable> {
        Log.info(".createRawReadStream() - file: " + file.name);
        return (await (new HttpStreamPool(file).getDownloadStream(async (id) => {
            return (await this.client.getFilesChannel().messages.fetch(id)).attachments.first()!.url;
        })));
    }

    public async createRawWriteStream(file: IFile): Promise<Writable> {
        Log.info(".createRawWriteStream() - file: " + file.name);

        const channel = this.client.getFilesChannel();
        let chunkId = 1;
        let currentSize = 0;
        let currentChunk = new PassThrough();

        const uploadStream = new Writable({
            write: async (chunk: Buffer, encoding: BufferEncoding, callback) => {
            if (currentSize + chunk.length > MAX_REAL_CHUNK_SIZE) {
                const remainingSpace = MAX_REAL_CHUNK_SIZE - currentSize;
                currentChunk.write(chunk.subarray(0, remainingSpace));
                currentChunk.end();
                await this.uploadChunkToDiscord(currentChunk, chunkId, channel, file);
                chunkId++;
                currentSize = chunk.length - remainingSpace;
                currentChunk = new PassThrough();
                currentChunk.write(chunk.subarray(remainingSpace));
                callback();
            } else {
                currentChunk.write(chunk);
                currentSize += chunk.length;
                callback();
            }

            file.size += chunk.length;
            },
            final: (callback) => {
            Log.info("final() Finalizing upload.");
            if (currentSize > 0) {
                currentChunk.end();
                this.uploadChunkToDiscord(currentChunk, chunkId, channel, file)
                .then(() => {
                    Log.info("final() write stream finished, onFinished() called.");
                    callback();
                })
                .catch(callback);
            } else {
                callback();
            }
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
        return MAX_REAL_CHUNK_SIZE;
    }

    calculateSavedFileSize(): number {
        return MAX_REAL_CHUNK_SIZE + ENCRYPTION_OVERHEAD;
    }
}
