import { AttachmentBuilder } from "discord.js";
import DiscordFileStorageApp from "./DiscordFileStorageApp";
import HttpStreamPool from './stream-helpers/HttpStreamPool';
import ServerFile from './file/ServerFile';
import {Writable, Readable} from "stream";
import { EventEmitter } from "events";
import TypedEmitter from 'typed-emitter';
import IFIleManager, { IUploadResult } from "./file/IFileManager";


export const MAX_CHUNK_SIZE: number = 8 * 1000 * 1000; // 8 MB, discord limit. 

export type RemoteFileManagerEvents = {
    fileUploaded: (file: ServerFile) => void;
    fileDeleted: (file: ServerFile) => void;
}

/**
 * Class that handles all the remote file management on discord.
 */
export default class DiscordFileManager extends (EventEmitter as new () => TypedEmitter<RemoteFileManagerEvents>) implements IFIleManager {
    private app: DiscordFileStorageApp;

    constructor(client: DiscordFileStorageApp) {
        super();
        this.app = client;
    }

    public async getDownloadableReadStream(file: ServerFile): Promise<Readable> {
        const filesChannel = await this.app.getFileChannel();
        
        let urls: string[] = [];
        for (const messageId of file.getDiscordMessageIds()) {
            const message = await filesChannel.messages.fetch(messageId);
            const attachment = message.attachments.first()!;
            urls.push(attachment.url);
        }
        
        return (await (new HttpStreamPool(urls)).getDownloadStream());
    }

    private getAttachmentBuilderFromBuffer(buff: Buffer, chunkName: string, chunkNummer: number = 0, addExtension: boolean = false, extension: string = "txt"){
        const builder = new AttachmentBuilder(buff);
        builder.setName( (chunkNummer ? chunkNummer + "-" : "") + chunkName + (addExtension ? "."+extension : "") );
        return builder;
    }

    public async postMetaFile(file: ServerFile, dispatchEvent: boolean): Promise<IUploadResult> {
        const metaChannel = await this.app.getMetadataChannel();

        let msg = await metaChannel.send("Uploading file meta...");

        file.setMetaIdInMetaChannel(msg.id);
        msg.edit({
            content: ":white_check_mark: File meta posted successfully.",
            files: [this.getAttachmentBuilderFromBuffer(Buffer.from(file.toJson()), file.getFileName(), 0, true)],
        });

        if (dispatchEvent) {
            this.emit("fileUploaded", file);
        }

        return {
            message: "File meta posted successfully.",
            success: true,
            file,
        }
    }
    
    public async getUploadWritableStream(file: ServerFile, size: number): Promise<Writable> {
        const filesChannel = await this.app.getFileChannel();
        let chunkNumber = 1;
        let totalChunks = Math.ceil(size / MAX_CHUNK_SIZE);
        file.setFilesPostedInChannelId(filesChannel.id);
        let buffer = Buffer.alloc(0);
        return new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                if(buffer.length + chunk.length > MAX_CHUNK_SIZE) {
                    console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
                    
                    const message = await filesChannel.send({
                        files: [this.getAttachmentBuilderFromBuffer(buffer, file.getFileName(), chunkNumber )],
                    });

                    file.addDiscordMessageId(message.id);
                    chunkNumber++;
                    buffer = chunk;
                    callback();
                }else{
                    buffer = Buffer.concat([buffer, chunk]);
                    callback();
                }
            },
            final: async (callback) => {
                console.warn("final");
                if(buffer.length === 0) {
                    return callback();
                }

                let message = await filesChannel.send({
                    files: [this.getAttachmentBuilderFromBuffer(buffer, file.getFileName(), chunkNumber )],
                });
                file.addDiscordMessageId(message.id);
                callback();
            }
        });
    }



    public async deleteFile(file: ServerFile, dispatchEvent: boolean): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();
        const metadataChannel = await this.app.getMetadataChannel();
        const messageIds = file.getDiscordMessageIds();

        const metadataMessage = await metadataChannel.messages.fetch(file.getMetaIdInMetaChannel());
        await metadataMessage.edit(":x: File is deleted. " + messageIds.length + " chunks will be deleted....");

        for (let i = 0; i < messageIds.length; i++) {
            const messageId = messageIds[i];
            const message = await filesChannel.messages.fetch(messageId);
            await message.delete();
        }
        
        await metadataMessage.delete();
        file.markDeleted();
        if (dispatchEvent) {
            this.emit("fileDeleted", file);
        }

        return {
            success: true,
            message: "File deleted successfully.",
            file,
        }
    }



}