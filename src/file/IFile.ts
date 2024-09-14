export interface IFile {
    name: string; // name is used only for raw provider, not for webdav. Webdav uses paths.  
    size: number;
    chunks: IChunkInfo[]
    created: Date;
    modified: Date;
    iv: Uint8Array
    // uploaded: boolean;
}

export interface IChunkInfo {
    id: string; // discord (or any other provider) message id
    size: number;
    // url: string;
}


export type IFilesDesc = Record<string, IFile>;