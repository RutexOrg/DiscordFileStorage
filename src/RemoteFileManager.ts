import path from "path";
import { AttachmentBuilder, TextBasedChannel } from "discord.js";
import { Writable, Readable } from "stream";
import DiscordFileStorageApp from "./DiscordFileStorageApp.js";
import HttpStreamPool from './stream-helpers/HttpStreamPool.js';
import RemoteFile from './file/RemoteFile.js';
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

    public async postMetaFile(file: RemoteFile): Promise<IUploadResult> {
        const metaChannel = await this.app.getMetadataChannel();

        let msg = await metaChannel.send("Uploading file meta...");
        console.log(".postMetaFile() - msg.id: " + msg.id + " - file: " + file.getFileName());
        file.setMessageMetaIdInMetaChannel(msg.id);

        msg.edit({
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
        if (!file.isUploaded()) {
            throw new Error("File is not valid: seems like it was not uploaded to discord yet.");
        }

        file.mofidyChangedDate();

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
    
    private async uploadFileChunkAndAttachToFile(buffer: typeof MutableBuffer, chunkNumber: number, totalChunks: number, filesChannel: TextBasedChannel, file: RemoteFile) {
        console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBufferWithoutExt((buffer as any).flush(), this.truncate(file.getFileName(), 15), chunkNumber, this.app.shouldEncryptFiles())
            ],
        });

        file.addAttachmentInfo({
            id: message.id,
            url: message.attachments.first()!.url,
            proxyUrl: message.attachments.first()!.proxyURL,
            length: buffer.length,
        });
    }

    public async getDownloadableReadStream(file: RemoteFile): Promise<Readable> {
        return (await (new HttpStreamPool(structuredClone(file.getAttachmentInfos()), file.getSize(), file.getEntryName())).getDownloadStream());
    }


    public async getUploadWritableStream(file: RemoteFile, size: number): Promise<Writable> {
        const filesChannel = await this.app.getFileChannel();
        let chunkNumber = 1;
        let totalChunks = Math.ceil(size / MAX_REAL_CHUNK_SIZE);
        file.setFilesPostedInChannelId(filesChannel.id);

        let buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);
        return new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                console.log("Writing chunk to buffer.")
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


    public async deleteFile(file: RemoteFile): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();
        const metadataChannel = await this.app.getMetadataChannel();
        const messageIds = file.getAttachmentInfos();

        const metadataMessage = await metadataChannel.messages.fetch(file.getMessageMetaIdInMetaChannel());
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