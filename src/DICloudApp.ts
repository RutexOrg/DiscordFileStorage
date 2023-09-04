import color from 'colors/safe.js';
import nodeFS from 'fs';
import os from 'os';
import DiscordFileProvider, { MAX_REAL_CHUNK_SIZE } from './provider/discord/DiscordFileProvider.js';
import axios from './helper/AxiosInstance.js';
import { make } from './Log.js';
import { IFile, IFilesDesc } from './file/IFile.js';
import { ChannelType, Client, ClientOptions, FetchMessagesOptions, Guild, Message, TextBasedChannel, TextChannel } from 'discord.js';
import VolumeEx from './file/VolumeEx.js';
import objectHash from "object-hash";


export interface DICloudAppOptions extends ClientOptions {
    metaChannelName: string;
    filesChannelName: string;

    shouldEncrypt: boolean;
    encryptPassword?: string;

    saveTimeout: number;
    saveToDisk: boolean;
}

/**
 * Main class of the DICloud. It is a Discord.js client with some additional functionality.
 */
export default class DICloudApp extends Client {

    private guildId: string;
    private metaChannelName: string;
    private filesChannelId: string;
    private createChannels: Array<string>;
    private provider: DiscordFileProvider;

    private shouldEncrypt;
    private encryptPassword;

    public static instance: DICloudApp;
    private logger = make("DICloud", true);

    private metadataMessageId: string | undefined;
    private fs!: VolumeEx;

    private debounceTimeout: NodeJS.Timeout | undefined;
    private debounceTimeoutTime: number;

    private saveToDisk: boolean = false;


    private tickInterval: NodeJS.Timeout | undefined;
    private tickIntervalTime: number = 1000;

    private readonly medataInfoMessage: string = "DiscordFS Metadata ✔";

    private guild!: Guild;
    private metaChannel!: TextBasedChannel;
    private filesChannel!: TextBasedChannel;


    constructor(options: DICloudAppOptions, guildId: string) {
        super(options);
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

        // catch all process errors and unhandled rejections, save files to disk before exiting.
        process.on('uncaughtException', async (err) => {
            console.log(color.red("Uncaught Exception: " + err));
            console.log(color.red("Saving files to disk... ( " + os.tmpdir() + "/discordfs.json )"));
            await DICloudApp.instance.saveFiles(true);
            process.exit(1);
        });

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

    public getMetadataChannel(): TextBasedChannel {
        return this.metaChannel;
    }

    public getFilesChannel(): TextBasedChannel {
        return this.filesChannel;
    }

    public async waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.once("ready", resolve as any);
        });
    }

    /**
     * Should be called after the bot is ready.
     * Preloads required data and starts the tick interval.
     */
    public async preload() {
        this.logger.info("Fetching guilds...");
        await this.guilds.fetch();

        if (!this.guilds.cache.has(this.guildId)) {
            printAndExit("Provided guild not found. Is the bot in the guild?");
        }

        const guild = await this.guilds.cache.get(this.guildId)?.fetch();
        if (!guild) {
            printAndExit("Failed to fetch guild: " + this.guildId);
        }
        this.guild = guild!;
        this.logger.info("Guild found: " + this.guild.name);
        this.logger.info("Fetching channels...");

        // check if channels exist
        await this.guild.channels.fetch();

        console.log(color.yellow("Fetching channels..."));
        await this.guild.channels.fetch();
        const channels = this.guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);

        for (const channel of this.createChannels) {
            if (!channels.some(c => c.name == channel)) {
                console.log("Creating channel: " + channel);
                await this.guild.channels.create({
                    name: channel,
                    type: ChannelType.GuildText,
                });
            }
        }

        this.metaChannel = channels.find(channel => channel.name == this.metaChannelName) as TextBasedChannel;
        this.filesChannel = channels.find(channel => channel.name == this.filesChannelId) as TextBasedChannel;

        this.tickInterval = setInterval(() => {
            this.tick();
        }, this.tickIntervalTime);

    }

    async getAllMessages(channelId: string): Promise<Message[]> {
        const channel = await this.channels.fetch(channelId) as TextChannel;
        let messages: Message[] = [];
        let last: string | undefined;

        while (true) {
            const options: FetchMessagesOptions = { limit: 100 };
            if (last) {
                options.before = last;
            }

            const channelMessages = [... (await channel.messages.fetch(options)).values()];

            messages = messages.concat(channelMessages);
            console.log("[getAllMessages] got block of " + channelMessages.length + " messages")
            if (channelMessages.length < 100) {
                break;
            }

            last = channelMessages.pop()!.id;
        }

        return messages;
    }


    public async loadFiles() {
        const messages = await this.getAllMessages(this.getMetadataChannel().id);
        let message; // meta message

        // check if there is a message with the metadata info. If not, create one.
        if (messages.length == 0) { // no messages
            message = await this.getMetadataChannel().send({
                files: [{
                    attachment: "{}", // empty json file
                    name: "discordfs.json"
                }],
                content: this.medataInfoMessage
            })
        } else if (messages.length == 1) { // one message
            message = messages[0];
        } else {
            throw new Error("Invalid amount of messages in metadata channel, there should only be one message. Maybe wrong channel is provided?");
        }

        this.metadataMessageId = message.id;

        if (message.attachments.size != 1) {
            throw new Error("Invalid amount of attachments in metadata message");
        }

        const attachment = message.attachments.first()!;
        if (attachment.name != "discordfs.json") {
            throw new Error("Invalid attachment name in metadata message, expected discordfs.json, got: " + attachment.name);
        }

        const file = await axios.get(attachment.url, { responseType: "arraybuffer" });
        let data;
        try {
            data = JSON.parse(file.data.toString()) as IFilesDesc;
        } catch (e) {
            console.log(e);
            printAndExit("Failed to parse JSON file. Is the file corrupted?");
        }

        this.fs = VolumeEx.fromJSON(data as any);
    }

    public async saveFiles(saveToDriveOnly: boolean = false) {
        console.log(color.yellow("Saving files..."));


        if (!this.metadataMessageId) {
            console.log(color.red("No metadata message id found, can't save files. Did you load the files?"));
            console.log(color.red("Trying to dump files into temp dir in the current real filesystem."));

            nodeFS.writeFileSync(os.tmpdir() + "/discordfs.json", JSON.stringify(this.fs.toJSON()));
            return;
        }

        if (this.saveToDisk) {
            nodeFS.writeFileSync(os.tmpdir() + "/discordfs.json", JSON.stringify(this.fs.toJSON()));

            if (saveToDriveOnly) {
                return;
            }
        }

        const msg = await this.getMetadataChannel().messages.fetch(this.metadataMessageId);
        if (!msg) {
            console.log(color.red("Failed to fetch metadata. Is the message deleted?"));
            return;
        }

        const json = this.fs.toJSON()
        const file = JSON.stringify(json);

        await msg.edit({
            files: [{
                name: "discordfs.json",
                attachment: Buffer.from(file)
            }],
            content: this.medataInfoMessage
                + '\n\n' + 'Last saved: ' + new Date().toLocaleString()
                + '\n' + 'Database Size: ' + file.length + ' bytes (' + Math.floor(file.length / MAX_REAL_CHUNK_SIZE * 100) + ' %)'
                + '\n' + 'Files: ' + Object.keys(json).length + ' files'
                + '\n' + 'Total Size: ' + (Math.floor(this.fs.getTreeSizeRecursive("/") / 1000 / 1000)) + ' MB'
                + '\n' + 'Hash: (' + objectHash(json) + ')'
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
        await this.provider.processDeletionQueue();
    }

    public getProvider(): DiscordFileProvider {
        return this.provider;
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