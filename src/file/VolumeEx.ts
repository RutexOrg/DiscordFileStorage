import { DirectoryJSON, Volume } from "memfs/lib/volume.js";
import { IFile } from "./IFile.js";
import Dirent from "memfs/lib/Dirent.js";

export interface IEntry {
    file: boolean,
    name: string,
}

export default class VolumeEx extends Volume {

    public static fromJSON(json: DirectoryJSON, cwd?: string | undefined): VolumeEx {
        const vol = new VolumeEx(cwd);
        vol.fromJSON(json);
        return vol;
    }

    public pathExists(path: string): boolean {
        try {
            this.statSync(path);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    public getFile(path: string): IFile {
        return JSON.parse(this.readFileSync(path).toString(), (k, v) => {
            if (k === "created" || k === "modified") {
                return new Date(v);
            }
            if (k === "iv") {
                return new Uint8Array(Object.values(v));
            }

            return v;
        }) as IFile;
    }

    public setFile(path: string, file: IFile) {
        this.writeFileSync(path, JSON.stringify(file));
    }

    private getFilesPathsRecursive(initial: string, paths: string[] = []) {
        const entries = this.readdirSync(initial, { withFileTypes: true });
        for (const entry of entries) {
            const path = initial === '/' ? '/' + (entry as Dirent).name : initial + '/' + (entry as Dirent).name;
            if ((entry as Dirent).isDirectory()) {
                this.getFilesPathsRecursive(path, paths);
            } else {
                paths.push(path);
            }
        }
        return paths;
    }

    public getFilesRecursive(path: string): IFile[] {
        return this.getFilesPathsRecursive(path).map(p => this.getFile(p));
    }

    public getFilesWithPathRecursive(path: string): Record<string, IFile> {
        return this.getFilesPathsRecursive(path).reduce((acc, path) => {
            acc[path] = this.getFile(path);
            return acc;
        }, {} as Record<string, IFile>);
    }

    public getPathsRecursive(path: string): string[] {
        return this.getFilesPathsRecursive(path);
    }

    public getTreeSizeRecursive(path: string): number {
        return this.getFilesRecursive(path).reduce((acc, file) => acc + file.size, 0);
    }

    // todo: reorganize this
    public getFilesAndFolders(path: string): IEntry[] {
        return this.readdirSync(path, { withFileTypes: true }).map((entry) => {
            return {
                file: (entry as Dirent).isFile(),
                name: (entry as Dirent).name.toString(),
            }
        });
    }

        
    
    

}