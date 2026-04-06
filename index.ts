import { boot, envBoot, createClient, IBootParams, IBootParamsParsed, IUserRecord } from "./bootloader.js";

// Export core classes for library usage
export { default as DICloudApp } from "./src/DICloudApp.js";
export { default as DiscordFileProvider } from "./src/provider/DiscordFileProvider.js";
export { default as BaseProvider } from "./src/provider/BaseProvider.js";
export { default as VolumeEx } from "./src/file/VolumeEx.js";
export { default as WebdavServer } from "./src/webdav/WebdavServer.js";
export type { IFile, IFilesDesc } from "./src/file/IFile.js";
export type { DICloudAppOptions } from "./src/DICloudApp.js";
export type { IBootParams, IBootParamsParsed, IUserRecord };

/**
 * Main exports for different use cases:
 * 
 * - `createClient()` - Create a client for library usage (no servers started)
 * - `boot()` - Boot with full server initialization (Discord bot + WebDAV)
 * - `envBoot()` - Boot from environment variables (.env file)
 */
export default {
    createClient,
    boot,
    envBoot,
}

export {
    createClient,
    boot,
    envBoot,
}

