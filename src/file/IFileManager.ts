import ServerFile from "./ServerFile";
import { Readable, Writable } from "stream";


export interface IUploadResult {
    success: boolean;
    message: string;
    file: ServerFile;
}

export interface IDeleteResult extends IUploadResult {};

export default interface IFIleManager {
    getDownloadableReadStream(file: ServerFile): Promise<Readable>;
    getUploadWritableStream(file: ServerFile, size: number): Promise<Writable>;
    postMetaFile(file: ServerFile, dispatchEvent: boolean): Promise<IUploadResult>;
    updateMetaFile(file: ServerFile): Promise<IUploadResult>;
    deleteFile(file: ServerFile, dispatchEvent: boolean): Promise<IDeleteResult>;
    renameFile(file: ServerFile, newName: string): Promise<IUploadResult>;

}