import nodeFS from 'fs';
import os from 'os';
import DiscordFileProvider, { MAX_CHUNK_SIZE } from './provider/DiscordFileProvider.js';
import axios from './helper/AxiosInstance.js';
import { IFile, IFilesDesc } from './file/IFile.js';
import { ChannelType, Client, ClientOptions, FetchMessagesOptions, Guild, Message, TextChannel } from 'discord.js';
import VolumeEx from './file/VolumeEx.js';
import objectHash from "object-hash";
import { printAndExit } from './helper/utils.js';
import BaseProvider from './provider/BaseProvider.js';
import WebdavServer from './webdav/WebdavServer.js';
import { Readable, Writable } from 'stream';
import Log from './Log.js';


export interface DICloudAppOptions extends ClientOptions {
    metaChannelName: string;
    filesChannelName: string;

    shouldEncrypt: boolean;
    encryptPassword?: string;

    saveTimeout: number;
    saveToDisk: boolean;
}

/**
 * Main class of the DICloud. Most functions are designed to work with webdav.
 */
export default class DICloudApp {
    public static instance: DICloudApp;

    private guildId: string;
    private metaChannelName: string;
    private filesChannelId: string;
    private createChannels: Array<string>;
    private provider: BaseProvider;

    private shouldEncrypt;
    private encryptPassword;


    private metadataMessage!: Message<boolean>;
    private fs!: VolumeEx;

    private debounceTimeout: NodeJS.Timeout | undefined;
    private debounceTimeoutTime: number;

    private saveToDisk: boolean = false;

    private tickInterval: NodeJS.Timeout | undefined;
    private tickIntervalTime: number = 1000;

    private readonly medataInfoMessage: string = "DiscordFS Metadata ✔";

    private guild!: Guild;
    private metaChannel!: TextChannel;
    private filesChannel!: TextChannel;


    private discordClient: Client
    private webdavServer?: WebdavServer;


    constructor(options: DICloudAppOptions, guildId: string) {
        this.discordClient = new Client(options);
        if (DICloudApp.instance) {
            throw new Error("DICloud already running");
        }
        DICloudApp.instance = this;

        this.createChannels = [
            options.metaChannelName,
            options.filesChannelName
        ];

        this.metaChannelName = options.metaChannelName;
        this.filesChannelId = options.filesChannelName;

        this.shouldEncrypt = options.shouldEncrypt;
        this.encryptPassword = options.encryptPassword ?? "";


        this.debounceTimeoutTime = options.saveTimeout;
        this.saveToDisk = options.saveToDisk;


        this.guildId = guildId;
        this.provider = new DiscordFileProvider(this);

    }

    public shouldEncryptFiles(): boolean {
        return this.shouldEncrypt;
    }

    public getEncryptPassword(): string {
        return this.encryptPassword;
    }

    public getGuild(): Guild {
        return this.guild;
    };

    public getMetadataChannel(): TextChannel {
        return this.metaChannel;
    }

    public getFilesChannel(): TextChannel {
        return this.filesChannel;
    }

    public async waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.discordClient.once("ready", resolve as any);
        });
    }

    public async login(token: string): Promise<void> {
        await this.discordClient.login(token);
    }

    public async init() {
        Log.info("Initializing DICloud...");
        await this.waitForReady();
        Log.info("Client authenticated...")
        await this.preload();
        await this.loadFiles();
        Log.info("DICloud initialized, files loaded...");
    }

    /**
     * Should be called after the bot is ready.
     * Preloads required data and starts the tick interval.
     */
    private async preload() {
        Log.info("Fetching guilds...");
        await this.discordClient.guilds.fetch();

        if (!this.discordClient.guilds.cache.has(this.guildId)) {
            printAndExit("Provided guild not found. Is the bot in the guild?");
        }

        const guild = await this.discordClient.guilds.cache.get(this.guildId)?.fetch();
        if (!guild) {
            printAndExit("Failed to fetch guild: " + this.guildId);
        }
        this.guild = guild!;
        Log.info("Guild found: " + this.guild.name);

        Log.info("Fetching channels...");
        await this.guild.channels.fetch();
        let channels = this.guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);

        let wasChannelCreated = false; // using for caching
        for (const channel of this.createChannels) {
            if (!channels.some(c => c.name == channel)) {
                Log.info("Creating channel: " + channel);
                await this.guild.channels.create({
                    name: channel,
                    type: ChannelType.GuildText,
                });
                wasChannelCreated = true;
            }
        }

        // Caching again, because we created new ones
        if(wasChannelCreated) {
            await this.guild.channels.fetch();
            channels = this.guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);
        }

        this.metaChannel = channels.find(channel => channel.name == this.metaChannelName) as TextChannel
        this.filesChannel = channels.find(channel => channel.name == this.filesChannelId) as TextChannel;

        this.tickInterval = setInterval(() => {
            this.tick();
        }, this.tickIntervalTime);

    }

    

    async getAllMessages(channelId: string): Promise<Message[]> {
        const channel = await this.discordClient.channels.fetch(channelId) as TextChannel;
        let messages: Message[] = [];
        let last: string | undefined;

        while (true) {
            const options: FetchMessagesOptions = { limit: 100 };
            if (last) {
                options.before = last;
            }

            const channelMessages = [... (await channel.messages.fetch(options)).values()];

            messages = messages.concat(channelMessages);
            Log.info("[getAllMessages] got block of " + channelMessages.length + " messages")
            if (channelMessages.length < 100) {
                break;
            }

            last = channelMessages.pop()!.id;
        }

        return messages;
    }


    private async loadFiles() {
        const messages = await this.getAllMessages(this.getMetadataChannel().id);
        let message; // meta message

        // check if there is a message with the metadata info. If not, create one.
        if (messages.length == 0) { // no messages
            message = await this.getMetadataChannel().send({
                files: [{
                    attachment: Buffer.from("{}"), // empty json file
                    name: "discordfs.json"
                }],
                content: this.medataInfoMessage
            })
        } else if (messages.length == 1) { // one message
            message = messages[0];
        } else {
            throw new Error("Invalid amount of messages in metadata channel, there should only be one message. Maybe wrong channel is provided?");
        }

        if (message.attachments.size != 1) {
            throw new Error("Invalid amount of attachments in metadata message");
        }

        const attachment = message.attachments.first()!;
        if (attachment.name != "discordfs.json") {
            throw new Error("Invalid attachment name in metadata message, expected discordfs.json, got: " + attachment.name);
        }

        const file = await axios.get(attachment.url, { responseType: "arraybuffer" });
        try {
            const data = JSON.parse(file.data.toString()) as IFilesDesc;
            
            this.fs = VolumeEx.fromJSON(data as any);
            this.metadataMessage = message;

        } catch (e) {
            Log.error(e);
            printAndExit("Failed to parse JSON file. Is the file corrupted?");
        }


    }

    public saveFiles(saveToDriveOnly: boolean = false, driveSaveForce: boolean = false): Promise<void> {
        Log.info("Saving files...");
        return new Promise<void>((resolve, reject) => {
            if (this.saveToDisk || driveSaveForce) {
                this.saveToDrive();
    
                if (saveToDriveOnly) {
                    resolve();
                    return;
                }
            }
    
            const json = this.fs.toJSON()
            const file = JSON.stringify(json);
    
            this.metadataMessage.edit({
                files: [{
                    name: "discordfs.json",
                    attachment: Buffer.from(file)
                }],
                content: this.medataInfoMessage
                    + '\n\n' + 'Last saved: ' + new Date().toLocaleString()
                    + '\n' + 'Database Size: ' + file.length + ' bytes (' + Math.floor(file.length / MAX_CHUNK_SIZE * 100) + ' %)'
                    + '\n' + 'Files: ' + Object.keys(json).length + ' files'
                    + '\n' + 'Total Size: ' + (Math.floor(this.fs.getTreeSizeRecursive("/") / 1000 / 1000)) + ' MB'
                    + '\n' + 'Hash: (' + objectHash(json) + ')'
            })
            .then(() => resolve())
            .catch((err) => {
                Log.info("Failed to save metadata message: " + err);
                this.saveToDrive();
                reject(err);
            });
        });
    }

    private saveToDrive() {
        Log.info("Saving files to disk... ( " + os.tmpdir() + "/discordfs.json )");
        nodeFS.writeFileSync(os.tmpdir() + "/discordfs.json", JSON.stringify(this.fs.toJSON()));
    }


    /**
     * Method that indicates that files were changed and should be saved to the provider.
     */
    public markForUpload() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = undefined;
        }

        this.debounceTimeout = setTimeout(() => {
            this.debounceTimeout = undefined;
            this.saveFiles();
        }, this.debounceTimeoutTime);
    }

    /**
     * Handler for the tick interval. This will delete messages from the deletion queue.
     * Queue is used to prevent ratelimiting and blocking the bot from doing other things.
     */
    private async tick() {
        await this.provider.processDeletionQueue();
    }

    public getProvider(): BaseProvider {
        return this.provider;
    }

    public getFs() {
        return this.fs;
    }

    public setWebdavServer(server: WebdavServer) {
        this.webdavServer = server;
    }

    public getWebdavServer() {
        return this.webdavServer;
    }

    public getDiscordClient() {
        return this.discordClient;
    }

    public createWriteStream(file: IFile): Promise<Writable> {
        return this.provider.createRawWriteStream(file);
    }

    public createReadStream(file: IFile): Promise<Readable> {
        return this.provider.createReadStream(file);
    }


    public async uploadFile(Buffer: Buffer, name: string): Promise<IFile> {
        return this.provider.uploadFile(Buffer, name);
    }

    public async downloadFile(file: IFile): Promise<Buffer> {
        return this.provider.downloadFile(file);
    }

    public async shutdown(saveToDfive: boolean = false): Promise<void> {
        if (this.webdavServer){
            await this.webdavServer.stopAsync();
        }
        clearInterval(this.tickInterval);
        clearInterval(this.debounceTimeout);

        await this.saveFiles(false, saveToDfive);
        await this.discordClient.destroy();
    }

}

