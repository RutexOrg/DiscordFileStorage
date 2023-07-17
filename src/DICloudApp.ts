import color from 'colors/safe.js';
import nodeFS from 'fs';
import os from 'os';
import DiscordFileManager from './provider/discord/DiscordFileManager.js';
import axios from './helper/AxiosInstance.js';
import { make } from './Log.js';
import { Volume } from 'memfs/lib/volume.js';
import { IFiles } from './file/IFile.js';
import { ChannelType, Client, ClientOptions, FetchMessagesOptions, Guild, Message, TextBasedChannel, TextChannel } from 'discord.js';



interface IDelayedDeletionEntry {
    channel: string;
    message: string;
}

export interface DiscordFileStorageAppOptions extends ClientOptions {
    metaChannelName: string;
    filesChannelName: string;

    shouldEncrypt: boolean;
    encryptPassword?: string;
}

/**
 * Main class of the DiscordFileStorageApp. It is a Discord.js client with some additional functionality.
 */
export default class FileStorageApp extends Client {

    private guildId: string;
    private metaChannelName: string;
    private filesChannelId: string;
    private channelsToCreate: Array<string>;
    private discordFileManager: DiscordFileManager;

    private shouldEncrypt;
    private encryptPassword;

    public static instance: FileStorageApp;
    private logger = make("DiscordFileStorageApp", true);

    private preloadComplete: boolean = false;
    private metadataMessageId: string | undefined;
    private fs!: Volume;
    private debounceTimeout: NodeJS.Timeout | undefined;
    private debounceTimeoutTime: number = 2000;

    private fileDeletionQueue: Array<IDelayedDeletionEntry> = [];

    private tickInterval: NodeJS.Timeout | undefined;

    private medataInfoMessage: string = "DiscordFS Metadata ✔";

    constructor(options: DiscordFileStorageAppOptions, guildId: string) {
        super(options);
        if (FileStorageApp.instance) {
            throw new Error("DiscordFileStorageApp already exists");
        }
        FileStorageApp.instance = this;

        this.channelsToCreate = [
            options.metaChannelName,
            options.filesChannelName
        ];

        this.metaChannelName = options.metaChannelName;
        this.filesChannelId = options.filesChannelName;

        this.shouldEncrypt = options.shouldEncrypt;
        this.encryptPassword = options.encryptPassword ?? "";

        this.guildId = guildId;
        this.discordFileManager = new DiscordFileManager(this);


    }

    public shouldEncryptFiles(): boolean {
        return this.shouldEncrypt;
    }

    public getEncryptPassword(): string {
        return this.encryptPassword;
    }


    public async getGuild(): Promise<Guild> {
        return this.guilds.cache.get(this.guildId)!.fetch();
    };

    public async getMetadataChannel(): Promise<TextBasedChannel> {
        return (await this.getGuild()).channels.cache.find(channel => channel.name == this.metaChannelName) as TextBasedChannel;
    }

    public async getFileChannel(): Promise<TextBasedChannel> {
        return (await this.getGuild()).channels.cache.find(channel => channel.name == this.filesChannelId) as TextBasedChannel;
    }

    public async waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.once("ready", resolve as any);
        });
    }

    public async preload() {
        if (!this.guilds.cache.has(this.guildId)) {
            printAndExit("Guild not found");
        }

        const guild = await this.guilds.cache.get(this.guildId)?.fetch()!;
        if (!guild) {
            printAndExit("Failed to fetch guild: " + this.guildId);
        }

        this.logger.info("Guild found: " + guild.name);
        console.log(color.yellow("Fetching channels..."));
        await guild.channels.fetch();
        const guildChannels = guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);
        
        for (const channelToCreate of this.channelsToCreate) {
            if (!guildChannels.some(channel => channel.name == channelToCreate)) {
                console.log("Creating channel: " + channelToCreate);
                await guild.channels.create({
                    name: channelToCreate,
                    type: ChannelType.GuildText,
                });
            } else {
                console.log(color.green("Channel already exists: " + channelToCreate + ", skipping"));
            }
        }

        this.tickInterval = setInterval(() => {
            this.tick();
        }, 2500);

        this.preloadComplete = true;
    }

    async getAllMessages(channelId: string): Promise<Message[]> {
        const channel = await this.channels.fetch(channelId) as TextChannel;
        let allMessages: Message[] = [];
        let last: string | undefined;

        while (true) {
            const options: FetchMessagesOptions = { limit: 100 };
            if (last) {
                options.before = last;
            }

            const messages = [... (await channel.messages.fetch(options)).values()];

            allMessages = allMessages.concat(messages);
            console.log("[getAllMessages] got block of " + messages.length + " messages")
            if (messages.length < 100) {
                break;
            }

            last = messages.pop()!.id;
        }

        return allMessages;
    }


    public async loadFiles() {
        const messages = await this.getAllMessages((await this.getMetadataChannel()).id);
        let metaMessage;

        if(messages.length > 1){
            throw new Error("Invalid amount of messages in metadata channel, there should only be one message");
        }

        metaMessage = messages[0];
        if (messages.length != 1) {
            const message = await (await this.getMetadataChannel()).send({
                files: [{
                    attachment: Buffer.from(JSON.stringify({})),
                    name: "discordfs.json"
                }],
                content: this.medataInfoMessage
            })
            metaMessage = message;
        }
        this.metadataMessageId = metaMessage.id;

        if (metaMessage.attachments.size != 1) {
            throw new Error("Invalid amount of attachments in metadata message");
        }

        const attachment = metaMessage.attachments.first()!;
        if (attachment.name != "discordfs.json") {
            throw new Error("Invalid attachment name in metadata message");
        }

        const file = await axios.get(attachment.url, { responseType: "arraybuffer" });
        const data = JSON.parse(file.data.toString()) as IFiles;

        this.fs = Volume.fromJSON(data as any);
    }

    public async saveFiles() {
        if (!this.fs) {
            console.log(color.red("No filesystem loaded, can't save files"));
            return;
        }

        console.log(color.yellow("Saving files..."));
        if (!this.metadataMessageId) {
            console.log(color.red("No metadata message id found, can't save files. Did you load the files?"));
            console.log(color.red("Trying to dump files into temp dir in the current real filesystem."));

            nodeFS.writeFileSync(os.tmpdir() + "/discordfs.json", JSON.stringify(this.fs.toJSON()));
            return;
        }

        const msg = await (await this.getMetadataChannel()).messages.fetch(this.metadataMessageId);
        if (!msg) {
            console.log(color.red("Failed to fetch metadata message"));
            return;
        }

        const obj = this.fs.toJSON()
        const file = JSON.stringify(obj);
        await msg.edit({
            files: [{
                name: "discordfs.json",
                attachment: Buffer.from(file)
            }],
            content: this.medataInfoMessage + '\n\n' + 'Last saved: ' + new Date().toLocaleString() + '\n' + 'Database Size: ' + file.length + ' bytes' + '\n' + 'Files: ' + Object.keys(obj).length + ' files'
        })
    }


    public markDirty() {
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
        if (this.fileDeletionQueue.length > 0) {
            const info = this.fileDeletionQueue.shift()!;
            const channel = this.channels.cache.get(info.channel) as TextChannel;
            
            if (!channel) {
                this.logger.error("Failed to find channel: " + info.channel);
                return;
            }

            await channel.messages.delete(info.message);
        }
    }

    public addToDeletionQueue(info: IDelayedDeletionEntry) {
        this.fileDeletionQueue.push(info);
    }


    public async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public getDiscordFileManager(): DiscordFileManager {
        return this.discordFileManager;
    }


    public getLogger() {
        return this.logger;
    }

    public getFs() {
        return this.fs;
    }





}


export function printAndExit(message: string, exitCode: number = 1) {
    console.log(color.red(message));
    process.exit(exitCode);
}


export function print(message: string) {
    console.log(color.green(message));
}