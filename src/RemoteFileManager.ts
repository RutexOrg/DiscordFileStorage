import { AttachmentBuilder } from "discord.js";
import DiscordFileStorageApp from "./DiscordFileStorageApp";
import EventQueue from "./stream-helpers/EventQeue";
import axios from "axios";
import HttpStreamPool from './stream-helpers/HttpStreamPool';
import ServerFile from './file/ServerFile';
import ClientFile from './file/ClientFile';
import FileManager from './file/FileTransformer';
import FileTransformer from './file/FileTransformer';
import { WriteStream, ReadStream } from "fs";
import {Writable, Readable} from "stream";
import { EventEmitter } from "events";
import TypedEmitter from 'typed-emitter';

interface IUploadResult {
    success: boolean;
    message: string;
    file: ServerFile;
}

interface IDownloadResult {
    success: boolean;
    message: string;
}

export const MAX_CHUNK_SIZE: number = 8 * 1000 * 1000; // 8 MB, discord limit. 

export type RemoteFileManagerEvents = {
    fileUploaded: (file: ServerFile) => void;
    fileDeleted: (file: ServerFile) => void;
}

/**
 * Class that handles all the remote file management on discord.
 */
export default class RemoteFileManager extends (EventEmitter as new () => TypedEmitter<RemoteFileManagerEvents>) {

    private app: DiscordFileStorageApp;
    private axiosInstance = axios.create({
        responseType: "stream",
    });

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

    // TODO: Make other functions work with this.
    private getBuilderFromFile(file: ServerFile){
        const builder = new AttachmentBuilder(Buffer.from(file.toJson()));
        builder.setName(file.getFileName() + ".txt");
        return builder;
    }

    public async postMetaFile(file: ServerFile, dispatchEvent: boolean): Promise<IUploadResult> {
        const metaChannel = await this.app.getMetadataChannel();

        let msg = await metaChannel.send("Uploading file meta...");

        file.setMetaIdInMetaChannel(msg.id);
        msg.edit({
            content: ":white_check_mark: File meta posted successfully.",
            files: [this.getBuilderFromFile(file)],
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
            write: async function (chunk, encoding, callback){ // write is called when a chunk of data is ready to be written to stream.
                if(buffer.length + chunk.length > MAX_CHUNK_SIZE) {
                    console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ${totalChunks} chunks.`);

                    const attachmentBuilder = new AttachmentBuilder(buffer);
                    attachmentBuilder.setName(chunkNumber + "-" + file.getFileName());
                    
                    const message = await filesChannel.send({
                        files: [attachmentBuilder],
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

                const attachmentBuilder = new AttachmentBuilder(buffer);
                attachmentBuilder.setName(chunkNumber + "-" + file.getFileName());
                let message = await filesChannel.send({
                    files: [attachmentBuilder],
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
        const string = ":x: File is being deleted soon... ";
        await metadataMessage.edit(string);

        for (let i = 0; i < messageIds.length; i++) {
            const messageId = messageIds[i];
            const message = await filesChannel.messages.fetch(messageId);
            await message.delete();
            await metadataMessage.edit(string + `(${i + 1}/${messageIds.length})`);
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