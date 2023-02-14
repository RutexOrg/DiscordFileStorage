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
import color from "colors/safe";

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

/**
 * Class that handles all the remote file management on discord.
 */
export default class RemoteFileManager {

    private app: DiscordFileStorageApp;
    private axiosInstance = axios.create({
        responseType: "stream",
    });

    constructor(client: DiscordFileStorageApp) {
        this.app = client;
    }

    public async downloadFile(file: ServerFile, asFile: ClientFile, writableStream?: WriteStream): Promise<IDownloadResult> {

        const filesChannel = await this.app.getFileChannel();
        const writeStream = writableStream ?? asFile.getWritableStream();

        let chunkNumber = 1;
        let totalChunks = file.getDiscordMessageIds().length;

        for (const messageId of file.getDiscordMessageIds()) {
            const message = await filesChannel.messages.fetch(messageId);
            const attachment = message.attachments.first()!;

            const stream = (await this.axiosInstance.get(attachment.url)).data as Readable;
            

            console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Downloading chunk ${chunkNumber} of ${totalChunks} chunks.`);
            stream.pipe(writeStream, { end: chunkNumber === totalChunks });
            stream.on("end", () => {
                console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Chunk ${chunkNumber} downloaded.`);
                chunkNumber++;
            });

            await new Promise((resolve) => {
                stream.on("end", () => {
                    resolve(true);
                });
            });

        }
        console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] File downloaded successfully.`);

        return {
            message: "File downloaded successfully.",
            success: true,
        }
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

    public async postMetaFile(file: ServerFile, dispatchEvent: boolean): Promise<IUploadResult> {
        const metaChannel = await this.app.getMetadataChannel();
        const builder = new AttachmentBuilder(Buffer.from(file.toJson()));
        builder.setName(file.getFileName() + ".txt");

        let msg = await metaChannel.send({
            files: [builder],
        });

        if (dispatchEvent) {
            this.app.emit("fileUploaded", file);
        }

        return {
            message: "File meta posted successfully.",
            success: true,
            file,
        }
    }


    public async uploadFile(f: ClientFile, readStream?: ReadStream): Promise<IUploadResult> {
        return new Promise(async (resolve, reject) => {
            let file = FileTransformer.clientToServerFile(f);
            const filesChannel = await this.app.getFileChannel();
            const asyncStream = new EventQueue(readStream ?? f.getReadableStream(MAX_CHUNK_SIZE), reject);
            let chunkNumber = 1;
            
            file.setFilesPostedInChannelId(filesChannel.id);
            
            asyncStream.on("readable", async () => {
                if (!asyncStream.stream.readableLength) {
                    asyncStream.destroy();
                    return;
                }
                console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${asyncStream.stream.readableLength} of ${file.getTotalSize()} bytes.`);

                let chunk = asyncStream.stream.read()!;

                const attachmentBuilder = new AttachmentBuilder(chunk);
                attachmentBuilder.setName(chunkNumber + "-" + file.getFileName());
                
                const message = await filesChannel.send({
                    files: [attachmentBuilder],
                });

                file.addDiscordMessageId(message.id);
                chunkNumber++;
            });

            asyncStream.on("end", async () => {
                console.log("File uploaded successfully.");
                resolve({
                    success: true,
                    message: "File uploaded successfully.",
                    file,
                });
            });

        });
    }
    
    public async getUploadWritableStream(file: ServerFile): Promise<Writable> {
        const filesChannel = await this.app.getFileChannel();
        let chunkNumber = 1;
        file.setFilesPostedInChannelId(filesChannel.id);
        let buffer = Buffer.alloc(0);
        return new Writable({
            write: async function (chunk, encoding, callback){ // write is called when a chunk of data is ready to be written
                file.setTotalSize(file.getTotalSize() + chunk.length);
                if(buffer.length + chunk.length > MAX_CHUNK_SIZE) {
                    console.log(new Date().toTimeString().split(' ')[0] + ` [${file.getFileName()}] Uploading chunk ${chunkNumber} of ? chunks.`);

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



    public async deleteFile(file: ServerFile): Promise<IUploadResult> {
        const filesChannel = await this.app.getFileChannel();
        const metadataChannel = await this.app.getMetadataChannel();
        const messageIds = file.getDiscordMessageIds();

        for (const messageId of messageIds) {
            const message = await filesChannel.messages.fetch(messageId);
            await message.delete();
        }

        const metadataMessage = await metadataChannel.messages.fetch(file.getMetaIdInMetaChannel());
        await metadataMessage.delete();
        file.markDeleted();
        return {
            success: true,
            message: "File deleted successfully.",
            file,
        }
    }



}