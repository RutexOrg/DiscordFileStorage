import { DirectoryJSON, Volume } from "memfs/lib/volume.js";
import { IFile } from "./IFile.js";

export default class VolumeEx extends Volume {

    public static fromJSON(json: DirectoryJSON, cwd?: string | undefined): VolumeEx {
        const vol = new VolumeEx(cwd);
        vol.fromJSON(json);
        return vol;
    }
    
    public getFile(path: string): IFile {
        return JSON.parse(this.readFileSync(path).toString(), (k, v) => {
            if (k === "created" || k === "modified") {
                return new Date(v);
            }
            return v;
        }) as IFile;
    }

    public setFile(path: string, file: IFile) {
        this.writeFileSync(path, JSON.stringify(file));
    }


}