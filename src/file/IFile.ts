export interface IFile {
    name: string;
    size: number;
    chunks: IChunkInfo[]
    created: Date;
    modified: Date;
    uploaded: boolean; // uploaded
}

export interface IChunkInfo {
    id: string; // discord (or any other) message id
    size: number;
    url: string;
}


export type IFiles = Record<string, IFile>;