import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ClientFile from "./ClientFile";
import Folder from "./filesystem/Folder";
import ServerFile from "./ServerFile";

/**
 * Helper class for manipulating files. 
 */
export default class FileTransformer {

    public static clientToServerFile(clientFile: ClientFile, folder: Folder): ServerFile {
        return new ServerFile(clientFile.getFileName(), clientFile.getTotalSize(), folder, clientFile.getUploadedDate());
    }

}