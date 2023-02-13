import DiscordFileStorageApp from "../DiscordFileStorageApp";
import ClientFile from "./ClientFile";
import ServerFile from "./ServerFile";

export default class FileTransformer {

    public static clientToServerFile(clientFile: ClientFile): ServerFile {
        return new ServerFile(clientFile.getFileName(), clientFile.getTotalSize(), [], clientFile.getUploadedDate());
    }

}