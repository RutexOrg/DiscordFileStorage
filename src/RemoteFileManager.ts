import path from "path";
import { AttachmentBuilder, TextBasedChannel } from "discord.js";
import { Writable, Readable } from "stream";
import DiscordFileStorageApp from "./DiscordFileStorageApp.js";
import HttpStreamPool from './stream-helpers/HttpStreamPool.js';
import ServerFile from './file/ServerFile.js';
import IFIleManager, { IUploadResult } from "./file/IFileManager.js";
import MutableBuffer from "./helper/MutableBuffer.js";

export const MAX_REAL_CHUNK_SIZE: number = 8 * 1000 * 1000; // 8 MB, discord limit. 

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
        let name = (chunkNummer ? chunkNummer + "-" : "") + chunkName + (addExtension ? "." + extension : "");
        if (encrypt) {
            console.log("encrypting")
            name += ".enc";
        }

        builder.setName(name);
        return builder;
    }

    private getAttachmentBuilderFromBufferWithoutExt(buff: Buffer, chunkName: string, chunkNummer: number = 0, encrypt: boolean, extension: string = "txt",) {
        return this.getAttachmentBuilderFromBuffer(buff, path.parse(chunkName).name, chunkNummer, false, encrypt, extension);
    }

    public async postMetaFile(file: ServerFile): Promise<IUploadResult> {
        const metaChannel = await this.app.getMetadataChannel();

        let msg = await metaChannel.send("Uploading file meta...");

        file.refreshUploadDate();
        file.setMetaIdInMetaChannel(msg.id);
        msg.edit({
            content: ":white_check_mark: File meta posted successfully.",
            files: [this.getAttachmentBuilderFromBuffer(Buffer.from(file.toJson()), file.getFileName(), 0, true, false)],
        });

        console.log("return");

        return {
            message: "File meta posted successfully.",
            success: true,
            file,
        }
    }

    public async updateMetaFile(file: ServerFile): Promise<IUploadResult> {
        if (!file.isUploaded()) {
            throw new Error("File is not valid: seems like it was not uploaded to discord yet.");
        }

        file.refreshUploadDate();

        const metaChannel = await this.app.getMetadataChannel();
        const msg = await metaChannel.messages.fetch(file.getMetaIdInMetaChannel());

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



    private async uploadFileChunkAndAttachToFile(buffer: typeof MutableBuffer, chunkNumber: number, totalChunks: number, filesChannel: TextBasedChannel, file: ServerFile) {
        MutableBuffer
        console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBufferWithoutExt((buffer as any).flush(), file.getFileName(), chunkNumber, this.app.shouldEncryptFiles())
            ],
        });

        file.addAttachmentInfo({
            id: message.id,
            url: message.attachments.first()!.url,
            proxyUrl: message.attachments.first()!.proxyURL,
        });
    }

    public async getDownloadableReadStream(file: ServerFile): Promise<Readable> {
        return (await (new HttpStreamPool(file.getAttachmentInfos().map(e => e.url))).getDownloadStream());
    }


    public async getUploadWritableStream(file: ServerFile, size: number): Promise<Writable> {
        const filesChannel = await this.app.getFileChannel();
        let chunkNumber = 1;
        let totalChunks = Math.ceil(size / MAX_REAL_CHUNK_SIZE);
        file.setFilesPostedInChannelId(filesChannel.id);

        let buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);
        return new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                if (buffer.size + chunk.length > MAX_REAL_CHUNK_SIZE) {
                    await this.uploadFileChunkAndAttachToFile((buffer as any), chunkNumber, totalChunks, filesChannel, file);
                    chunkNumber++;
                }
                buffer.write(chunk, encoding);
                callback();
            },
            final: async (callback) => {
                if (buffer.size > 0) {
                    await this.uploadFileChunkAndAttachToFile((buffer as any), chunkNumber, totalChunks, filesChannel, file);
                }
                buffer = null as any;
                callback();
            }
        });
    }


    public async deleteFile(file: ServerFile): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();
        const metadataChannel = await this.app.getMetadataChannel();
        const messageIds = file.getAttachmentInfos();

        const metadataMessage = await metadataChannel.messages.fetch(file.getMetaIdInMetaChannel());
        await metadataMessage.edit(":x: File is deleted. " + messageIds.length + " chunks will be deleted....");

        for (let i = 0; i < messageIds.length; i++) {
            const attachmentInfo = messageIds[i];
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

    public async renameFile(file: ServerFile, newName: string): Promise<IUploadResult> {
        file.setFileName(newName);
        await this.updateMetaFile(file);

        return {
            success: true,
            message: "File renamed successfully.",
            file,
        }
    }

}