import { AttachmentBuilder } from "discord.js";
import DiscordFileStorageApp from "./DiscordFileStorageApp";
import HttpStreamPool from './stream-helpers/HttpStreamPool';
import ServerFile from './file/ServerFile';
import {Writable, Readable} from "stream";
import { EventEmitter } from "events";
import TypedEmitter from 'typed-emitter';
import IFIleManager, { IUploadResult } from "./file/IFileManager";
import Folder from "./file/filesystem/Folder";
import { MutableBuffer } from "mutable-buffer";

export const MAX_REAL_CHUNK_SIZE: number = 8 * 1000 * 1000; // 8 MB, discord limit. 

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

    // TODO: detect socket close and cleanup
    public async getDownloadableReadStream(file: ServerFile, callback: (stream: Readable) => void) {
        const filesChannel = await this.app.getFileChannel();
        const httpStreamPool = new HttpStreamPool();
        callback(httpStreamPool.getReadable());

        for (const messageId of file.getDiscordMessageIds()) {
            console.log("Fetching message " + messageId);
            const message = await filesChannel.messages.fetch(messageId);
            httpStreamPool.addUrl(message.attachments.first()!.url);
        }
        console.log("Marking httpStreamPool as finished");
        httpStreamPool.markFinished();
        
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
            console.log("Dispatching fileUploaded event")
            this.emit("fileUploaded", file);
        }
        console.log("return");

        return {
            message: "File meta posted successfully.",
            success: true,
            file,
        }
    }

    public async updateMetaFile(file: ServerFile): Promise<IUploadResult> {
        if(!file.isUploaded()){
            throw new Error("File is not valid: seems like it was not uploaded to discord yet.");
        }

        const metaChannel = await this.app.getMetadataChannel();
        const msg = await metaChannel.messages.fetch(file.getMetaIdInMetaChannel());
        
        await msg.edit({
            content: ":white_check_mark: :white_check_mark: File info updated successfully.",
            files: [this.getAttachmentBuilderFromBuffer(Buffer.from(file.toJson()), file.getFileName(), 0, true)],
        });

        return {
            message: "File meta updated successfully.",
            success: true,
            file,
        }
    }

    
    public async getUploadWritableStream(file: ServerFile, size: number): Promise<Writable> {
        const filesChannel = await this.app.getFileChannel();
        let chunkNumber = 1;
        let totalChunks = Math.ceil(size / MAX_REAL_CHUNK_SIZE);
        file.setFilesPostedInChannelId(filesChannel.id);

        let buffer = new MutableBuffer(MAX_REAL_CHUNK_SIZE);
        return new Writable({
            write: async (chunk, encoding, callback) => { // write is called when a chunk of data is ready to be written to stream.
                if(buffer.size + chunk.length < MAX_REAL_CHUNK_SIZE) {
                    buffer.write(chunk, encoding);
                }else{
                    console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
                    const message = await filesChannel.send({
                        files: [this.getAttachmentBuilderFromBuffer(buffer.nativeBuffer, file.getFileName(), chunkNumber )],
                    });

                    file.addDiscordMessageId(message.id);;
                    chunkNumber++;

                    buffer.clear();
                    buffer.write(chunk, encoding);
                }
                callback();                                               
            },
            final: async (callback) => {
                console.warn("final");

                if(buffer.size > 0) {
                    console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);
                    const message = await filesChannel.send({
                        files: [this.getAttachmentBuilderFromBuffer(buffer.nativeBuffer, file.getFileName(), chunkNumber )],
                    });
                    
                    file.addDiscordMessageId(message.id);
                }
                buffer.clear();
                buffer = null as any;
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