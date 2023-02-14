import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ClientFile from "./ClientFile";
import ServerFile from "./ServerFile";

/**
 * Helper class for manipulating files. 
 */
export default class FileTransformer {

    public static clientToServerFile(clientFile: ClientFile, folders: string[] = []): ServerFile {
        return new ServerFile(clientFile.getFileName(), clientFile.getTotalSize(), folders, clientFile.getUploadedDate());
    }

}