import path from "path";
import { AttachmentBuilder, TextBasedChannel } from "discord.js";
import { Writable, Readable } from "stream";
import DiscordFileStorageApp from "./DiscordFileStorageApp.js";
import HttpStreamPool from './stream-helpers/HttpStreamPool.js';
import RemoteFile, { IChunkInfo } from './file/RemoteFile.js';
import IFIleManager, { IUploadResult, IWriteStreamCallbacks } from "./IFileManager.js";
import MutableBuffer from "./helper/MutableBuffer.js";





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
        console.log(".postMetaFile() - msg.id: " + msg.id + " - file: " + file.getFileName());
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
        console.log(".updateMetaFile() - file: " + file.getFileName(), file.toString());
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
        console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
        const message = await filesChannel.send({
            files: [
                this.getAttachmentBuilderFromBufferWithoutExt(buffer.flush(), this.truncate(file.getFileName(), 15), chunkNumber, this.app.shouldEncryptFiles())
            ],
        });

        console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Chunk ${chunkNumber} of ${totalChunks} chunks added.`);
        file.addChunk({
            id: message.id,
            url: message.attachments.first()!.url,
            proxyUrl: message.attachments.first()!.proxyURL,
            length: buffer.size,
        });
        console.dir(file.getChunks())
    }

    public async getDownloadableReadStream(file: RemoteFile): Promise<Readable> {
        return (await (new HttpStreamPool(structuredClone(file.getChunks()), file.getSize(), file.getEntryName())).getDownloadStream());
    }



    public async getUploadWritableStream(file: RemoteFile, size: number, callbacks: IWriteStreamCallbacks): Promise<Writable> {
        const filesChannel = await this.app.getFileChannel();
        const totalChunks = Math.ceil(size / MAX_REAL_CHUNK_SIZE);
        let currentChunkNumber = 1;
        
        file.setFilesPostedInChannelId(filesChannel.id);

        const buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);
        
        return new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                if (buffer.size + chunk.length > MAX_REAL_CHUNK_SIZE) {
                    currentChunkNumber++;
                    await this.uploadFileChunkAndAttachToFile(buffer, currentChunkNumber, totalChunks, filesChannel, file);
                    if (callbacks.onChunkUploaded) {
                        await callbacks.onChunkUploaded(currentChunkNumber, totalChunks);
                    }
                }
                buffer.write(chunk, encoding);
                callback();
            },
            final: async (callback) => {
                console.log("final() Finalizing upload.")
                if (buffer.size > 0) {
                    await this.uploadFileChunkAndAttachToFile(buffer, currentChunkNumber, totalChunks, filesChannel, file);
                }

                console.log("final() uploaded .")                
                if(callbacks.onFinished){
                    await callbacks.onFinished();
                }

                console.log("final() write stream finished, onFinished() called.")
                callback();
            }
        });
    }


    public async deleteFile(file: RemoteFile, awaitForChunksDelete: boolean = true): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();
        const metadataChannel = await this.app.getMetadataChannel();
        const chunks = file.getChunks();

        const metadataMessage = await metadataChannel.messages.fetch(file.getMessageMetaIdInMetaChannel());
        await metadataMessage.edit(":x: File is deleted. " + chunks.length + " chunks will be deleted....");

        // if (awaitForChunksDelete) {
        //     await this.deleteChunks(chunks);
        // } else {
        //     this.deleteChunks(chunks);
        // }

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