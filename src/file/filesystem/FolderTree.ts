import Folder, { ElementType } from "./Folder";

export default class FolderTree {

    private root: Folder;

    constructor() {
        this.root = new Folder("", null, true);
    }


    public getRoot(): Folder {
        return this.root;
    }

}