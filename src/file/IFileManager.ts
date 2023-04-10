import RemoteFile from "./RemoteFile";
import { Readable, Writable } from "stream";


export interface IUploadResult {
    success: boolean;
    message: string;
    file: RemoteFile;
}

export interface IDeleteResult extends IUploadResult {};

export default interface IFIleManager {
    getDownloadableReadStream(file: RemoteFile, callback: (stream: Readable) => void): void;
    getUploadWritableStream(file: RemoteFile, size: number): Promise<Writable>;
    
    postMetaFile(file: RemoteFile): Promise<IUploadResult>;
    updateMetaFile(file: RemoteFile): Promise<IUploadResult>;

    deleteFile(file: RemoteFile): Promise<IDeleteResult>;
    renameFile(file: RemoteFile, newName: string): Promise<IUploadResult>;
}