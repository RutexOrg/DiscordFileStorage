import Folder, { ElementType } from "./Folder";
import ServerFile from "../ServerFile";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";

export type DiscordFileSystemEvents = {
    fileAdded: (file: ServerFile) => void;
    fileDeleted: (file: ServerFile) => void;
    folderAdded: (folder: Folder) => void;
    folderDeleted: (folder: Folder) => void;
}

export default class DiscordFileSystem extends (EventEmitter as new () => TypedEmitter<DiscordFileSystemEvents>) {
    
    private root: Folder;

    constructor() {
        super();
        this.root = new Folder("",null, true);
    }


    public getRoot(): Folder {
        return this.root;
    }


}