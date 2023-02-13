import { ReadStream } from 'fs-extra';
import { WriteStream } from 'fs-extra';
import { ChannelType, Client, ClientOptions, FetchMessagesOptions, Guild, GuildBasedChannel, Message, TextBasedChannel, TextChannel } from 'discord.js';
import color from 'colors/safe';
import RemoteFileManager from './RemoteFileManager';
import axios from 'axios';
import ServerFile from './file/ServerFile';
import FileManager from './file/FileTransformer';
import ClientFile from './file/ClientFile';


export default class DiscordFileStorageApp extends Client {
   
    private files: Array<ServerFile> = [];
    private guildId: string;
    
    private channelsToCreate = [
        "filebot-metadata",
        "filebot-files",
    ]

    private remoteFileManager: RemoteFileManager;

    public static instance: DiscordFileStorageApp;

    constructor(options: ClientOptions, guildId: string) {
        super(options);
        if(DiscordFileStorageApp.instance){
            throw new Error("DiscordFileStorageApp already exists");
        }

        DiscordFileStorageApp.instance = this;
        this.guildId = guildId;
        this.remoteFileManager = new RemoteFileManager(this);
        this.once("fileUploaded", (file: ServerFile) => {
            this.files.push(file);
        });

    }

    public async getGuild(): Promise<Guild>{
        return this.guilds.cache.get(this.guildId)!.fetch();
    };
    
    public async getMetadataChannel(): Promise<TextBasedChannel> {
        return (await this.getGuild()).channels.cache.find(channel => channel.name.toLowerCase() == "filebot-metadata") as TextBasedChannel;
    }

    public async getFileChannel(): Promise<TextBasedChannel> {
        return (await this.getGuild()).channels.cache.find(channel => channel.name.toLowerCase() == "filebot-files") as TextBasedChannel;
    }

    public async prepare(){
        const guilds = this.guilds.cache;

        if(!guilds.has(this.guildId)){
            printAndExit("Guild not found");
        }
    
        const guild = await guilds.get(this.guildId)?.fetch()!;
        if(!guild){
            printAndExit("Failed to fetch guild");
        }
    
        console.log(color.yellow("Fetching channels..."));
        let guildChannels = guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);
        for(let chan of this.channelsToCreate){
            if(!guildChannels.some(channel => channel.name.toLowerCase() == chan.toLowerCase())){
                console.log("creating channel: " + chan );
                await guild.channels.create({
                    name: chan,
                    type: ChannelType.GuildText,
                });
            }else{
                console.log(color.green("channel already exists: " + chan));
            }
        }

    }

    async getAllMessages(id: string): Promise<Message[]> {
        const channel = await this.channels.fetch(id) as TextChannel;
        let allMessages: Message[] = [];
        let lastId: string | undefined;
    
        while (true) {
          const options: FetchMessagesOptions = { limit: 100 };
          if (lastId) {
            options.before = lastId;
          }
    
          const messages = [... (await channel.messages.fetch(options)).values()];

          allMessages = allMessages.concat(messages);
          if (messages.length < 100) {
            break;
          }
    
          lastId = messages.pop()!.id;
        }
    
        return allMessages;
      }

    public getFiles(): Array<ServerFile> {
        return this.files;
    }

    /**
     * loadFiles
     */
    public async  loadFilesToCache() {
        const metaDataChannelId = (await this.getMetadataChannel()).id;
        let messages = (await this.getAllMessages(metaDataChannelId));
        for(let msg of messages){
            if(msg.attachments.size > 0){
                let file = (await axios.get(msg.attachments.first()!.url)).data as object;
                if(ServerFile.isValidRemoteFile(file)){
                    const remoteFile = ServerFile.fromObject(file);
                    remoteFile.setMetaIdInMetaChannel(msg.id);
                    this.files.push(remoteFile);
                }else{
                    console.log("Failed to extract valid message data");
                    console.log(file);
                }
            }
        }
    }
    
    public async postMetaFile(file: ServerFile, strict: boolean = true, distapchEvent: boolean){
        if(strict){
            if(file.getDiscordMessageIds.length == 0){
                throw new Error("No discord message ids");
            }
            if(!file.getFilesPostedInChannelId()){
                throw new Error("No channel id where files are posted");
            }
        }
        return this.remoteFileManager.postMetaFile(file, distapchEvent);

    }

    public async uploadFile(file: ClientFile, stream?: ReadStream){
        if(this.files.some(f => f.getFileName() == file.getFileName())){
            throw new Error("File already exists");
        }

        let resultUpload = await this.remoteFileManager.uploadFile(file, stream);
        console.log("upload result: " + resultUpload.success);
        let resultPostMeta = await this.remoteFileManager.postMetaFile(resultUpload.file, false);
        console.log("post meta result: " + resultPostMeta.success);
    
        return resultUpload;
    }

    public async downloadFile(file: ServerFile, asFile: ClientFile,  writeStream?: WriteStream) {
        return this.remoteFileManager.downloadFile(file, asFile, writeStream);
    }

    public async deleteFile(file: ServerFile){
        return this.remoteFileManager.deleteFile(file);
    }

    public async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    public getFileManager(): RemoteFileManager {
        return this.remoteFileManager;
    }






}



export function printAndExit(message: string, exitCode: number = 1){
    console.log(color.red(message));
    process.exit(exitCode);
}

